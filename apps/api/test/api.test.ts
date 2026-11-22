/**
 * Integration tests against a real Postgres (database `<name>_test`) and Redis.
 * Covers the sacred isolation test, group permissions, the weekly money math,
 * idempotent close, payments and a contest upheld after close.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const base = process.env.DATABASE_URL ?? '';
if (!base) throw new Error('DATABASE_URL não definido (rode com o .env carregado)');
const testUrl = base.replace(/\/([^/?]+)(\?|$)/, '/$1_test$2');
Object.assign(process.env, { DATABASE_URL: testUrl, NODE_ENV: 'test', SCHEDULER: 'off', APP_WEB_URL: 'http://localhost:3310', LOG_LEVEL: 'error', UPLOAD_DIR: './uploads-test' });

const DIST = `${__dirname}/../dist/`;
// Native require keeps one module cache, so DI tokens (classes) match the running app.
const nodeRequire = createRequire(__filename);
let app: INestApplication;
let url = '';

class Client {
  cookie = '';
  async req<T = any>(method: string, path: string, body?: unknown, opts: { csrf?: boolean } = {}): Promise<{ status: number; data: T }> {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { ...(opts.csrf === false ? {} : { 'x-requested-with': 'tenace' }), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie().find((c) => c.startsWith('tenace_session='));
    if (set) this.cookie = set.split(';')[0]!;
    const text = await res.text();
    return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
  }
  get = <T = any>(p: string) => this.req<T>('GET', p);
  post = <T = any>(p: string, b?: unknown) => this.req<T>('POST', p, b ?? {});
}

const ana = new Client();
const bruno = new Client();
const stranger = new Client();
let groupId = '';
let gymId = '';
let bookId = '';
let today = '';

beforeAll(async () => {
  // Fresh schema on the dedicated test database (never the dev one).
  const opts = { cwd: `${__dirname}/..`, env: { ...process.env, DATABASE_URL: testUrl }, stdio: 'pipe' as const };
  try {
    execSync('npx prisma db execute --stdin --schema prisma/schema.prisma', { ...opts, input: 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' });
  } catch {
    /* database does not exist yet: migrate deploy creates it */
  }
  execSync('npx prisma migrate deploy', opts);
  // Nest needs emitDecoratorMetadata (tsc), which Vitest's esbuild does not emit: test the built app.
  const { createApp } = nodeRequire(DIST + 'main.js') as typeof import('../src/main');
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  url = url.replace('[::1]', '127.0.0.1');
  const { localDate } = await import('@tenace/rules');
  today = localDate(new Date(), 'America/Sao_Paulo');
  const redis = app.get((nodeRequire(DIST + 'common/redis.service.js') as typeof import('../src/common/redis.service')).RedisService);
  await redis.client.flushdb();
});

afterAll(async () => {
  await app?.close();
});

describe('auth', () => {
  it('signs up and rejects missing CSRF header', async () => {
    expect((await ana.post('/auth/signup', { name: 'Ana', email: 'ana@test.dev', password: 'senha1234' })).status).toBe(201);
    expect((await bruno.post('/auth/signup', { name: 'Bruno', email: 'bruno@test.dev', password: 'senha1234' })).status).toBe(201);
    expect((await stranger.post('/auth/signup', { name: 'Zé', email: 'ze@test.dev', password: 'senha1234' })).status).toBe(201);
    expect((await ana.get('/auth/me')).data.user.email).toBe('ana@test.dev');
    expect((await ana.req('POST', '/groups', {}, { csrf: false })).status).toBe(403);
    expect((await new Client().get('/auth/me')).status).toBe(401);
  });

  it('mobile login returns a bearer token that works without cookies', async () => {
    const r = await new Client().post('/auth/login', { email: 'ana@test.dev', password: 'senha1234', client: 'mobile' });
    expect(r.data.token).toBeTruthy();
    const me = await fetch(`${url}/auth/me`, { headers: { authorization: `Bearer ${r.data.token}` } });
    expect(me.status).toBe(200);
  });
});

describe('groups and isolation', () => {
  it('creates a group that starts now with two goals', async () => {
    const r = await ana.post('/groups', {
      name: 'Teste',
      emoji: '🔥',
      startMode: 'now',
      destination: { label: 'Caixinha', pixKeyType: 'email', pixKey: 'ana@test.dev', holderName: 'Ana', city: 'Sao Paulo' },
      goals: [
        { name: 'Academia', emoji: '🏋️', period: 'weekly', target: 3, unit: 'times', stakeCents: 500 },
        { name: 'Livro', emoji: '📚', period: 'weekly', target: 3, unit: 'times', stakeCents: 500 },
      ],
    });
    expect(r.status).toBe(201);
    groupId = r.data.id;
    const goals = (await ana.get(`/groups/${groupId}/goals`)).data.goals;
    gymId = goals.find((g: any) => g.name === 'Academia').id;
    bookId = goals.find((g: any) => g.name === 'Livro').id;
    const acc = (await ana.get(`/groups/${groupId}/account`)).data;
    expect(acc.balanceCents).toBe(-3000);
    expect(acc.weekCents).toBe(-3000);
    expect(acc.openDebtCents).toBe(0);
  });

  it('SACRED: a non-member gets 404 on every group route and sees nothing', async () => {
    for (const p of ['', '/members', '/goals', '/week', '/weeks', '/feed', '/account', '/fund', '/payments']) {
      expect((await stranger.get(`/groups/${groupId}${p}`)).status, p).toBe(404);
    }
    expect((await stranger.post(`/groups/${groupId}/checkins`, { goalId: gymId, date: today })).status).toBe(404);
    expect((await stranger.get('/me/overview')).data.groups).toHaveLength(0);
  });

  it('link invite → join request → approval; new member is charged from next week', async () => {
    const inv = await ana.post(`/groups/${groupId}/invites`, { kind: 'link' });
    expect(inv.status).toBe(201);
    expect((await bruno.get(`/invites/${inv.data.token}`)).data.group.name).toBe('Teste');
    expect((await bruno.post(`/invites/${inv.data.token}/accept`)).data.status).toBe('requested');
    expect((await bruno.get(`/groups/${groupId}`)).status).toBe(404);
    const reqs = (await ana.get(`/groups/${groupId}/join-requests`)).data.requests;
    expect(reqs).toHaveLength(1);
    expect((await ana.post(`/groups/${groupId}/join-requests/${reqs[0].id}/approve`)).status).toBe(200);
    const detail = await bruno.get(`/groups/${groupId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.me.role).toBe('member');
    const ov = (await bruno.get('/me/overview')).data.groups[0];
    expect(ov.charged).toBe(false);
  });

  it('members cannot manage goals, confirm payments or invite', async () => {
    expect((await bruno.post(`/groups/${groupId}/goals`, { name: 'X', period: 'weekly', target: 1, unit: 'times', stakeCents: 100 })).status).toBe(403);
    expect((await bruno.post(`/groups/${groupId}/invites`, { kind: 'link' })).status).toBe(403);
    expect((await bruno.post(`/groups/${groupId}/expenses`, { amountCents: 100, description: 'pizza' })).status).toBe(403);
    expect((await bruno.req('PATCH', `/groups/${groupId}`, { name: 'Hack' })).status).toBe(403);
  });
});

describe('weekly money math (user example: −R$30 → −R$5)', () => {
  it('each check-in pays a slot; extra check-ins pay nothing', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await ana.post(`/groups/${groupId}/checkins`, { goalId: gymId, date: today });
      expect(r.status).toBe(201);
      expect(r.data.slotDeltaCents).toBe(500);
    }
    expect((await ana.post(`/groups/${groupId}/checkins`, { goalId: gymId, date: today })).data.slotDeltaCents).toBe(0);
    await ana.post(`/groups/${groupId}/checkins`, { goalId: bookId, date: today });
    await ana.post(`/groups/${groupId}/checkins`, { goalId: bookId, date: today, note: 'cap. 2' });
    const acc = (await ana.get(`/groups/${groupId}/account`)).data;
    expect(acc.balanceCents).toBe(-500);
    expect(acc.weekCents).toBe(-500);
  });

  it('rejects future dates', async () => {
    const { addDays } = await import('@tenace/rules');
    const r = await ana.post(`/groups/${groupId}/checkins`, { goalId: gymId, date: addDays(today, 1) });
    expect(r.status).toBe(400);
    expect(r.data.code).toBe('checkin_outside_window');
  });

  it('close is idempotent and moves the shortfall to the fund', async () => {
    const { WeeksService } = nodeRequire(DIST + 'modules/domain/weeks.service.js') as typeof import('../src/modules/domain/weeks.service');
    const weeks = app.get(WeeksService);
    const board = (await ana.get(`/groups/${groupId}/week`)).data;
    await weeks.closeWeek(board.week.id);
    await weeks.closeWeek(board.week.id);
    const fund = (await ana.get(`/groups/${groupId}/fund`)).data;
    expect(fund.receivableCents).toBe(500);
    expect(fund.debtors).toEqual([expect.objectContaining({ name: 'Ana', openDebtCents: 500 })]);
    const acc = (await ana.get(`/groups/${groupId}/account`)).data;
    expect(acc.openDebtCents).toBe(500);
    expect(acc.weekCents).toBe(0);
  });

  it('payment declared and confirmed settles the debt', async () => {
    const p = await ana.post(`/groups/${groupId}/payments`, { amountCents: 500, note: 'pix' });
    expect(p.data.status).toBe('pending');
    // Ana is the only admin/owner, so she may confirm her own payment (flagged in the feed).
    expect((await bruno.post(`/groups/${groupId}/payments/${p.data.id}/confirm`)).status).toBe(403);
    expect((await ana.post(`/groups/${groupId}/payments/${p.data.id}/confirm`)).status).toBe(200);
    expect((await ana.post(`/groups/${groupId}/payments/${p.data.id}/confirm`)).status).toBe(400);
    const fund = (await ana.get(`/groups/${groupId}/fund`)).data;
    expect(fund.receivableCents).toBe(0);
    expect(fund.cashCents).toBe(500);
    expect((await ana.get(`/groups/${groupId}/account`)).data.balanceCents).toBe(0);
  });

  it('a contest upheld after close reverses the slot and corrects the fund', async () => {
    const feed = (await bruno.get(`/groups/${groupId}/feed`)).data.items;
    const book = feed.find((i: any) => i.checkIn?.goalName === 'Livro' && i.checkIn.note === 'cap. 2');
    expect((await bruno.post(`/groups/${groupId}/checkins/${book.checkIn.id}/contests`, { reason: 'não leu' })).status).toBe(201);
    const ct = (await ana.get(`/groups/${groupId}/feed`)).data.items.find((i: any) => i.checkIn?.id === book.checkIn.id).checkIn.contests[0];
    expect((await bruno.post(`/groups/${groupId}/contests/${ct.id}/resolve`, { decision: 'uphold' })).status).toBe(403);
    expect((await ana.post(`/groups/${groupId}/contests/${ct.id}/resolve`, { decision: 'uphold', note: 'justo' })).status).toBe(200);
    const acc = (await ana.get(`/groups/${groupId}/account`)).data;
    expect(acc.balanceCents).toBe(-500);
    expect(acc.entries[0].type).toBe('SLOT_REVERSAL');
    expect((await ana.get(`/groups/${groupId}/fund`)).data.receivableCents).toBe(500);
  });
});

describe('platform admin, integrations and webhooks', () => {
  const admin = new Client();
  let anaId = '';
  const prisma = () => app.get((nodeRequire(DIST + 'common/prisma.service.js') as typeof import('../src/common/prisma.service')).PrismaService);

  it('admin routes are invisible to regular users', async () => {
    expect((await ana.get('/admin/users')).status).toBe(404);
    expect((await ana.req('PUT', '/admin/integrations/calebepay', { enabled: true })).status).toBe(404);
  });

  it('platform admin defines a password manually and old sessions end', async () => {
    await admin.post('/auth/signup', { name: 'Admin', email: 'admin@test.dev', password: 'senha1234' });
    await prisma().user.update({ where: { email: 'admin@test.dev' }, data: { role: 'platform_admin' } });
    const users = (await admin.get('/admin/users?q=ana@')).data.users;
    anaId = users[0].id;
    expect((await admin.post(`/admin/users/${anaId}/password`, { password: 'curta' })).status).toBe(400);
    expect((await admin.post(`/admin/users/${anaId}/password`, { password: 'novaSenha99' })).status).toBe(200);
    expect((await ana.get('/auth/me')).status).toBe(401);
    expect((await ana.post('/auth/login', { email: 'ana@test.dev', password: 'novaSenha99' })).status).toBe(200);
  });

  it('reset link from the admin works once', async () => {
    const r = await admin.post(`/admin/users/${anaId}/reset-link`);
    const token = new URL(r.data.url).searchParams.get('token');
    expect((await new Client().post('/auth/password-reset/confirm', { token, password: 'outraSenha77' })).status).toBe(200);
    expect((await new Client().post('/auth/password-reset/confirm', { token, password: 'outraSenha88' })).status).toBe(400);
    expect((await ana.post('/auth/login', { email: 'ana@test.dev', password: 'outraSenha77' })).status).toBe(200);
  });

  it('capabilities report no e-mail provider by default', async () => {
    expect((await new Client().get('/auth/capabilities')).data.passwordResetByEmail).toBe(false);
  });

  it('Calebe Pay secrets are stored encrypted and never returned', async () => {
    const r = await admin.req('PUT', '/admin/integrations/calebepay', { enabled: true, config: {}, secrets: { apiKey: 'cp_test_abcdefghijklmnop1234', webhookSecret: 'whsec_test_secret_value_9876' } });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.data)).not.toContain('abcdefghijklmnop');
    expect(r.data.secrets.apiKey).toEqual({ set: true, hint: 'cp_test_…1234' });
    const row = await prisma().integrationSetting.findUnique({ where: { key: 'calebepay' } });
    expect(row?.secrets).toMatch(/^v1\./);
    expect(row?.secrets).not.toContain('cp_test_');
    // Keep the API key when only toggling.
    const again = await admin.req('PUT', '/admin/integrations/calebepay', { enabled: true });
    expect(again.data.secrets.apiKey.set).toBe(true);
  });

  it('webhook: valid signature stored once, invalid rejected', async () => {
    const { createHmac } = await import('node:crypto');
    const body = JSON.stringify({ id: 'evt_test_1', type: 'transaction.updated', livemode: false, data: { id: 'tx_1', status: 'paid', reference: 'license-1' } });
    const t = Math.floor(Date.now() / 1000);
    const sig = `t=${t},v1=${createHmac('sha256', 'whsec_test_secret_value_9876').update(`${t}.${body}`).digest('hex')}`;
    const send = (signature: string) => fetch(`${url}/webhooks/calebepay`, { method: 'POST', headers: { 'content-type': 'application/json', 'calebe-signature': signature }, body });
    expect((await send(sig)).status).toBe(200);
    expect(await (await send(sig)).json()).toEqual({ ok: true, duplicate: true });
    expect((await send(`t=${t},v1=deadbeef`)).status).toBe(401);
    const stored = await prisma().webhookEvent.findUnique({ where: { id: 'evt_test_1' } });
    expect(stored?.processedAt).toBeTruthy();
  });
});

describe('plans, subscriptions and the block (Calebe Pay faked)', () => {
  const boss = new Client();
  const carla = new Client();
  const prisma = () => app.get((nodeRequire(DIST + 'common/prisma.service.js') as typeof import('../src/common/prisma.service')).PrismaService);
  const payments = () => app.get((nodeRequire(DIST + 'modules/integrations/payments.service.js') as typeof import('../src/modules/integrations/payments.service')).PaymentsService);
  let freeId = '';
  let proId = '';
  const fake = {
    paidTx: new Set<string>(),
    checkoutTx: null as string | null,
    cycleDue: null as string | null,
    created: [] as { key: string; method: string; firstDueDate: string; amountCents: number }[],
  };
  const profile = { name: 'Ana Souza', document: '529.982.247-25', email: 'ana@test.dev', phone: '(11) 99999-8888', address: { zipCode: '01310-100', street: 'Avenida Paulista', number: '1000', district: 'Bela Vista', city: 'São Paulo', state: 'sp' } };

  beforeAll(async () => {
    await boss.post('/auth/signup', { name: 'Boss', email: 'boss@test.dev', password: 'senha1234' });
    await prisma().user.update({ where: { email: 'boss@test.dev' }, data: { role: 'platform_admin' } });
    await boss.post('/auth/login', { email: 'boss@test.dev', password: 'senha1234' });
    await carla.post('/auth/signup', { name: 'Carla', email: 'carla@test.dev', password: 'senha1234' });
    payments().override = {
      name: 'calebepay',
      testMode: true,
      async createCheckout(input) {
        return { providerCheckoutId: `chk_${input.reference}`, checkoutUrl: `https://pay.test/checkout/${input.reference}`, livemode: false };
      },
      async getCheckout(id) {
        return { id, status: fake.checkoutTx ? 'completed' : 'open', transactionId: fake.checkoutTx ?? undefined };
      },
      async getTransaction(id) {
        return { id, status: fake.paidTx.has(id) ? 'paid' : 'pending', reference: '', amountCents: 2990, livemode: false, simulated: true };
      },
      async createSubscription(input) {
        fake.created.push({ key: input.idempotencyKey, method: input.method, firstDueDate: input.firstDueDate, amountCents: input.amountCents });
        return { id: `sub_${fake.created.length}`, status: 'active', nextDueDate: '2099-01-01', cycle: 1, livemode: false, lastError: null };
      },
      async getSubscription(id) {
        return { id, status: 'active', nextDueDate: '2099-01-01', cycle: 1, livemode: false, lastError: null };
      },
      async listCycles(id) {
        const c = fake.created[Number(id.slice(4)) - 1]!;
        return [{ cycle: 0, dueDate: fake.cycleDue ?? c.firstDueDate, amountCents: c.amountCents, status: 'created', transactionId: null, transactionStatus: null, paymentUrl: `https://pay.test/cycle/${id}` }];
      },
      async cancelSubscription() {},
      async listCostCenters() {
        return [{ id: 'cc_tenace', name: 'Tenace', active: true }];
      },
      async ping() {
        return { mode: 'test' as const };
      },
    };
  });

  afterAll(() => {
    payments().override = null;
  });

  it('admin creates a free default plan and a paid plan; users cannot', async () => {
    const free = await boss.post('/admin/plans', { name: 'Grátis', priceCents: 0, intervalMonths: 1, maxGroups: 1, maxMembersPerGroup: 2, isDefault: true });
    expect(free.status).toBe(201);
    freeId = free.data.id;
    expect((await boss.post('/admin/plans', { name: 'Caro padrão', priceCents: 100, intervalMonths: 1, maxGroups: null, maxMembersPerGroup: null, isDefault: true })).status).toBe(400);
    const pro = await boss.post('/admin/plans', { name: 'Pro', priceCents: 2990, intervalMonths: 1, maxGroups: 5, maxMembersPerGroup: 20 });
    proId = pro.data.id;
    expect((await ana.post('/admin/plans', { name: 'x', priceCents: 0, intervalMonths: 1, maxGroups: 1, maxMembersPerGroup: 2 })).status).toBe(404);
    expect((await new Client().get('/plans')).data.plans.map((p: { name: string }) => p.name)).toEqual(['Grátis', 'Pro']);
  });

  it('the free plan limits groups and members', async () => {
    // Ana already owns one group with Bruno (2 people): no second group, no third member.
    const g = await ana.post('/groups', { name: 'Segundo', emoji: '📚', color: 'sky', timezone: 'America/Sao_Paulo', startMode: 'next', destination: { label: 'Caixa', holderName: '', pixKeyType: null, pixKey: '', bankInfo: '', city: '' }, goals: [{ name: 'Ler', emoji: '📚', period: 'weekly', target: 3, unit: 'times', stakeCents: 500, activeWeekdays: [1, 2, 3, 4, 5, 6, 7] }] });
    expect(g.status).toBe(403);
    expect(g.data.code).toBe('plan_limit');
    const inv = await ana.post(`/groups/${groupId}/invites`, { kind: 'link' });
    expect(inv.status).toBe(403);
    expect((await ana.get('/me/billing')).data).toMatchObject({ status: 'ok', plan: { name: 'Grátis' }, usage: { groups: 1, largestGroup: 2 } });
  });

  it('subscribing to Pro (Pix) creates the Calebe subscription and the first invoice', async () => {
    const r = await ana.post('/me/billing/subscribe', { planId: proId, method: 'pix', profile });
    expect(r.status).toBe(200);
    expect(r.data.plan.name).toBe('Pro');
    expect(r.data.status).toBe('due');
    expect(r.data.invoices).toHaveLength(1);
    expect(fake.created[0]).toMatchObject({ method: 'pix', firstDueDate: today, amountCents: 2990 });
    const stored = await prisma().subscription.findFirst({ where: { user: { email: 'ana@test.dev' } } });
    expect((stored?.billingProfile as { document: string }).document).toBe('52998224725');
    // On time: the cycle's own Pix link.
    const pay = await ana.post(`/me/billing/invoices/${r.data.invoices[0].id}/pay`, {});
    expect(pay.data.url).toBe('https://pay.test/cycle/sub_1');
    // Pro allows more members now.
    expect((await ana.post(`/groups/${groupId}/invites`, { kind: 'link' })).status).toBe(201);
  });

  it('an invoice 6 days late blocks the owner and pauses the group for members', async () => {
    const { addDays } = await import('@tenace/rules');
    const old = addDays(today, -6);
    const anaUser = await prisma().user.findUniqueOrThrow({ where: { email: 'ana@test.dev' } });
    await prisma().invoice.updateMany({ where: { userId: anaUser.id }, data: { dueDate: new Date(`${old}T00:00:00Z`), providerReference: `sub_1:${old}` } });
    fake.cycleDue = old;
    const sync = await ana.post('/me/billing/sync');
    expect(sync.data.status).toBe('blocked');
    const blocked = await ana.get('/me/overview');
    expect(blocked.status).toBe(403);
    expect(blocked.data.code).toBe('account_blocked');
    expect((await ana.get('/me/billing')).status).toBe(200);
    // Bruno (member) sees the group as paused and cannot open it.
    const ov = await bruno.get('/me/overview');
    expect(ov.data.groups.find((g: { group: { id: string } }) => g.group.id === groupId)).toMatchObject({ blocked: true, checkinGoals: [] });
    const gr = await bruno.get(`/groups/${groupId}/week`);
    expect(gr.status).toBe(403);
    expect(gr.data.code).toBe('group_blocked');
    expect((await prisma().group.findUniqueOrThrow({ where: { id: groupId } })).billingPausedAt).toBeTruthy();
    // A blocked owner cannot dodge the debt by switching to the free plan.
    expect((await ana.post('/me/billing/subscribe', { planId: freeId })).data.code).toBe('account_blocked');
  });

  it('paying the late invoice through a checkout unblocks at once and the group resumes', async () => {
    const invoice = (await ana.get('/me/billing')).data.invoices[0];
    expect(invoice.overdue).toBe(true);
    const pay = await ana.post(`/me/billing/invoices/${invoice.id}/pay`, {});
    expect(pay.data.url).toBe(`https://pay.test/checkout/tinv-${invoice.id}`);
    fake.checkoutTx = 'txn_late_1';
    const notYet = await ana.post('/me/billing/sync');
    expect(notYet.data.status).toBe('blocked'); // checkout chosen but not paid yet
    fake.paidTx.add('txn_late_1');
    const done = await ana.post('/me/billing/sync');
    expect(done.data.status).toBe('ok');
    expect(done.data.invoices[0]).toMatchObject({ status: 'paid', paidVia: 'checkout' });
    expect((await ana.get('/me/overview')).status).toBe(200);
    expect((await bruno.get(`/groups/${groupId}/week`)).status).toBe(200);
    expect((await prisma().group.findUniqueOrThrow({ where: { id: groupId } })).billingPausedAt).toBeNull();
  });

  it('a week of a paused group closes voided: owed amounts compensated, no penalty to the fund', async () => {
    const { WeeksService } = nodeRequire(DIST + 'modules/domain/weeks.service.js') as typeof import('../src/modules/domain/weeks.service');
    const weeks = app.get(WeeksService);
    const { addDays, weekStartOf } = await import('@tenace/rules');
    const future = addDays(weekStartOf(today), 14);
    const weekId = await weeks.openWeek(groupId, future);
    await prisma().group.update({ where: { id: groupId }, data: { billingPausedAt: new Date() } });
    await weeks.closeWeek(weekId);
    const mws = await prisma().memberWeek.findMany({ where: { weekId } });
    expect(mws.length).toBeGreaterThan(0);
    expect(mws.every((m) => m.penaltyCents === 0 && m.allMet === null)).toBe(true);
    const ledger = await prisma().ledgerEntry.findMany({ where: { weekId } });
    const net = ledger.reduce((sum, e) => sum + e.amountCents, 0);
    expect(net).toBe(0); // COMMITMENT − … + ADJUSTMENT = 0: nobody owes this week
    expect(await prisma().fundEntry.count({ where: { weekId } })).toBe(0);
    await prisma().group.update({ where: { id: groupId }, data: { billingPausedAt: null } });
  });

  it('charges carry the configured Calebe Pay cost center', async () => {
    const { CalebePayProvider } = nodeRequire(DIST + 'modules/integrations/calebepay.provider.js') as typeof import('../src/modules/integrations/calebepay.provider');
    const customer = { name: 'Ana', document: '52998224725', email: 'ana@test.dev', phone: '11999998888' };
    const input = { reference: 'tinv-x', idempotencyKey: 'k', amountCents: 990, description: 'x', methods: ['pix' as const], dueDate: today, customer };
    expect(new CalebePayProvider('https://api.test', 'cp_test_x', 'cc_f215b67862fb6aa5ab69cdbf22f5af1a').buildBody(input)).toMatchObject({ cost_center_id: 'cc_f215b67862fb6aa5ab69cdbf22f5af1a' });
    expect(new CalebePayProvider('https://api.test', 'cp_test_x').buildBody(input)).not.toHaveProperty('cost_center_id');
    const bad = await boss.req('PUT', '/admin/integrations/calebepay', { enabled: true, config: { costCenterId: 'nao-e-centro' } });
    expect(bad.status).toBe(400);
    const ok = await boss.req('PUT', '/admin/integrations/calebepay', { enabled: true, config: { costCenterId: 'cc_f215b67862fb6aa5ab69cdbf22f5af1a' } });
    expect(ok.data.config.costCenterId).toBe('cc_f215b67862fb6aa5ab69cdbf22f5af1a');
  });

  it('switching back to the free plan is refused while usage does not fit', async () => {
    const tooBig = await ana.post('/groups', { name: 'Segundo', emoji: '📚', color: 'sky', timezone: 'America/Sao_Paulo', startMode: 'next', destination: { label: 'Caixa', holderName: '', pixKeyType: null, pixKey: '', bankInfo: '', city: '' }, goals: [{ name: 'Ler', emoji: '📚', period: 'weekly', target: 3, unit: 'times', stakeCents: 500, activeWeekdays: [1, 2, 3, 4, 5, 6, 7] }] });
    expect(tooBig.status).toBe(201);
    const back = await ana.post('/me/billing/subscribe', { planId: freeId });
    expect(back.status).toBe(400);
    expect(back.data.message).toMatch(/2 grupos/);
    await prisma().plan.updateMany({ data: { isDefault: false } }); // later suites run without limits
  });
});
