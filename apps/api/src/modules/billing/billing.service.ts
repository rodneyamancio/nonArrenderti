import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, type Invoice, type Plan, type Subscription } from '@prisma/client';
import { addDays, BILLING_GRACE_DAYS, billingState, canAddMember, canOwnAnotherGroup, formatCents, localDate, planFitProblem, weekStartOf } from '@tenace/rules';
import type { BillingMethod, BillingProfile, BillingStatus, BillingView, InvoiceView, PlanView } from '@tenace/types';
import { EnvService } from '../../common/env.service';
import { DomainBadRequest, DomainForbidden, DomainNotFound, DomainUnavailable } from '../../common/errors/domain-exceptions';
import { OutboundError } from '../../common/http';
import { NotifyService } from '../../common/notify.service';
import { PrismaService } from '../../common/prisma.service';
import { fromDbDate, shortDate, toDbDate } from '../../common/request';
import type { PaymentCustomer, PaymentProvider } from '../integrations/calebepay.provider';
import { PaymentsService, type CalebeEvent } from '../integrations/payments.service';

const BILLING_TZ = 'America/Sao_Paulo';
const TICK_MS = 10 * 60_000;
const LOCK_KEY = 7_141_301; // pg advisory lock for the billing tick (weeks use 7_141_300)
const CYCLE_REF = /^(sub_[A-Za-z0-9_-]+):(\d{4}-\d{2}-\d{2})$/;
const CHECKOUT_REF = /^tinv-([a-z0-9]+)$/;

type SubWithPlan = Subscription & { plan: Plan | null };

export const planView = (p: Plan): PlanView => ({
  id: p.id,
  name: p.name,
  description: p.description,
  priceCents: p.priceCents,
  intervalMonths: p.intervalMonths,
  maxGroups: p.maxGroups,
  maxMembersPerGroup: p.maxMembersPerGroup,
  isDefault: p.isDefault,
  active: p.active,
  sortOrder: p.sortOrder,
});

/**
 * Plans, subscriptions and the block (docs/spec.md §8.10).
 * - A user's plan = their subscription's plan, or the default plan (null = no limits yet).
 * - Paid plans are Calebe Pay subscriptions (Pix or boleto cycles). Each cycle is an Invoice.
 * - An invoice still open 5 days after its due date blocks the account and pauses the groups it owns;
 *   paying it (cycle link, or a checkout with Pix/boleto/card) unblocks at once.
 * Status is cached on Subscription.status and recomputed on every payment, sync and tick.
 */
@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Billing');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly notify: NotifyService,
    private readonly envs: EnvService,
  ) {}

  onModuleInit(): void {
    this.payments.onEvent((e) => this.handleEvent(e));
    if (this.envs.env.SCHEDULER === 'off') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    setTimeout(() => void this.tick(), 20_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  today(now = new Date()): string {
    return localDate(now, BILLING_TZ);
  }

  // ------------------------------------------------------------------ plans & limits
  async defaultPlan(): Promise<Plan | null> {
    return this.prisma.plan.findFirst({ where: { isDefault: true }, orderBy: { createdAt: 'asc' } });
  }

  async planFor(userId: string): Promise<Plan | null> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
    return sub?.plan ?? (await this.defaultPlan());
  }

  /** Groups the user owns (active) and the size of the largest one. */
  async usage(userId: string): Promise<{ groups: number; largestGroup: number }> {
    const owned = await this.prisma.member.findMany({ where: { userId, role: 'owner', status: { in: ['active', 'leaving'] }, group: { archivedAt: null } }, select: { groupId: true } });
    let largest = 0;
    for (const o of owned) largest = Math.max(largest, await this.memberCount(o.groupId));
    return { groups: owned.length, largestGroup: largest };
  }

  private memberCount(groupId: string): Promise<number> {
    return this.prisma.member.count({ where: { groupId, status: { in: ['active', 'leaving'] } } });
  }

  private async groupOwnerId(groupId: string): Promise<string | null> {
    const owner = await this.prisma.member.findFirst({ where: { groupId, role: 'owner', status: { in: ['active', 'leaving'] } }, select: { userId: true } });
    return owner?.userId ?? null;
  }

  async assertCanCreateGroup(userId: string): Promise<void> {
    const plan = await this.planFor(userId);
    const { groups } = await this.usage(userId);
    if (!canOwnAnotherGroup(plan, groups)) {
      throw new DomainForbidden('plan_limit', `Seu plano ${plan!.name} permite ${plan!.maxGroups} ${plan!.maxGroups === 1 ? 'grupo' : 'grupos'}. Mude de plano para criar mais.`, { kind: 'groups', limit: plan!.maxGroups });
    }
  }

  /** One more member in this group fits the owner's plan? */
  async assertCanAddMember(groupId: string): Promise<void> {
    const ownerId = await this.groupOwnerId(groupId);
    if (!ownerId) return;
    const plan = await this.planFor(ownerId);
    if (!canAddMember(plan, await this.memberCount(groupId))) {
      throw new DomainForbidden('plan_limit', `O grupo chegou ao limite de ${plan!.maxMembersPerGroup} pessoas do plano ${plan!.name} do dono.`, { kind: 'members', limit: plan!.maxMembersPerGroup });
    }
  }

  /** Transfer: the new owner's plan must fit one more group of this size. */
  async assertCanReceiveGroup(userId: string, groupId: string): Promise<void> {
    const plan = await this.planFor(userId);
    const { groups } = await this.usage(userId);
    const size = await this.memberCount(groupId);
    if (!canOwnAnotherGroup(plan, groups) || (plan?.maxMembersPerGroup != null && size > plan.maxMembersPerGroup)) {
      throw new DomainForbidden('plan_limit', `O plano ${plan!.name} dessa pessoa não comporta mais este grupo.`, { kind: 'transfer' });
    }
    if (await this.isUserBlocked(userId)) throw new DomainForbidden('plan_limit', 'A assinatura dessa pessoa está bloqueada.', { kind: 'transfer' });
  }

  // ------------------------------------------------------------------ block
  async isUserBlocked(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId }, select: { status: true } });
    return sub?.status === 'blocked';
  }

  async isGroupBlocked(groupId: string): Promise<boolean> {
    const ownerId = await this.groupOwnerId(groupId);
    return ownerId ? this.isUserBlocked(ownerId) : false;
  }

  /** Recomputes the cached status from the open invoices and applies block/unblock side effects. */
  async evaluate(userId: string, now = new Date()): Promise<BillingStatus> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId }, include: { invoices: { where: { status: 'open' }, select: { dueDate: true, status: true } } } });
    if (!sub) return 'ok';
    const state = billingState(
      sub.invoices.map((i) => ({ dueDate: fromDbDate(i.dueDate), status: i.status })),
      this.today(now),
    );
    if (state.status === sub.status) return state.status;
    const wasBlocked = sub.status === 'blocked';
    const isBlocked = state.status === 'blocked';
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: state.status, blockedAt: isBlocked ? (sub.blockedAt ?? now) : null } });
    if (isBlocked && !wasBlocked) await this.onBlocked(userId, now);
    if (wasBlocked && !isBlocked) await this.onUnblocked(userId, now);
    return state.status;
  }

  private async ownedGroups(userId: string) {
    return this.prisma.group.findMany({ where: { archivedAt: null, members: { some: { userId, role: 'owner', status: { in: ['active', 'leaving'] } } } } });
  }

  private async onBlocked(userId: string, now: Date): Promise<void> {
    const groups = await this.ownedGroups(userId);
    await this.prisma.group.updateMany({ where: { id: { in: groups.map((g) => g.id) }, billingPausedAt: null }, data: { billingPausedAt: now } });
    await this.notify.users([userId], { type: 'billing_blocked', title: 'Conta bloqueada por falta de pagamento', body: 'Pague a mensalidade em atraso para reativar sua conta e seus grupos.', link: '/assinatura' });
    for (const g of groups) {
      const members = await this.prisma.member.findMany({ where: { groupId: g.id, status: { in: ['active', 'leaving'] }, userId: { not: userId } }, select: { userId: true } });
      await this.notify.users(members.map((m) => m.userId), { groupId: g.id, type: 'group_paused', title: `${g.emoji} ${g.name} está pausado`, body: 'A assinatura do dono do grupo está em atraso. As semanas ficam paradas e ninguém é cobrado até a reativação.' });
      await this.notify.feed(g.id, 'group_paused', 'Grupo pausado: a assinatura do dono está em atraso. Ninguém é cobrado enquanto isso.');
    }
    this.logger.log(`blocked user=${userId} groups=${groups.length}`);
  }

  private async onUnblocked(userId: string, now: Date): Promise<void> {
    const groups = (await this.ownedGroups(userId)).filter((g) => g.billingPausedAt);
    for (const g of groups) {
      const ws = weekStartOf(localDate(now, g.timezone));
      const current = await this.prisma.week.findUnique({ where: { groupId_weekStart: { groupId: g.id, weekStart: toDbDate(ws) } }, select: { id: true } });
      // The week opened before the block keeps running; otherwise the group resumes next Monday (never mid-week).
      await this.prisma.group.update({ where: { id: g.id }, data: { billingPausedAt: null, resumesOnWeek: current ? null : toDbDate(addDays(ws, 7)) } });
      const members = await this.prisma.member.findMany({ where: { groupId: g.id, status: { in: ['active', 'leaving'] }, userId: { not: userId } }, select: { userId: true } });
      const when = current ? 'A semana atual continua valendo.' : `As metas voltam a contar na segunda, ${shortDate(addDays(ws, 7))}.`;
      await this.notify.users(members.map((m) => m.userId), { groupId: g.id, type: 'group_resumed', title: `${g.emoji} ${g.name} foi reativado`, body: when, link: `/g/${g.id}` });
      await this.notify.feed(g.id, 'group_resumed', `Grupo reativado! ${when}`);
    }
    await this.notify.users([userId], { type: 'billing_unblocked', title: 'Conta reativada 🎉', body: 'Pagamento confirmado. Sua conta e seus grupos voltaram ao normal.', link: '/assinatura' });
    this.logger.log(`unblocked user=${userId} groups=${groups.length}`);
  }

  // ------------------------------------------------------------------ view
  async view(userId: string): Promise<BillingView> {
    const [sub, plans, defaultPlan, usage, ready] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true, invoices: { orderBy: { dueDate: 'desc' }, take: 24 } } }),
      this.prisma.plan.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] }),
      this.defaultPlan(),
      this.usage(userId),
      this.payments.isReady(),
    ]);
    const plan = sub?.plan ?? defaultPlan;
    const today = this.today();
    const open = (sub?.invoices ?? []).map((i) => ({ dueDate: fromDbDate(i.dueDate), status: i.status }));
    const state = billingState(open, today);
    return {
      plan: plan ? planView(plan) : null,
      status: state.status,
      daysToBlock: state.daysToBlock,
      graceDays: BILLING_GRACE_DAYS,
      subscription: sub?.providerSubscriptionId && sub.method ? { method: sub.method as BillingMethod, nextDueDate: sub.nextDueDate ? fromDbDate(sub.nextDueDate) : null, livemode: sub.livemode, cancelledAt: null } : null,
      invoices: (sub?.invoices ?? []).filter((i) => i.status !== 'void').map((i) => this.invoiceView(i, today)),
      usage,
      plans: plans.map(planView),
      paymentsReady: ready,
      profile: (sub?.billingProfile as BillingProfile | null) ?? null,
    };
  }

  private invoiceView(i: Invoice, today: string): InvoiceView {
    const due = fromDbDate(i.dueDate);
    return { id: i.id, amountCents: i.amountCents, dueDate: due, status: i.status, paidAt: i.paidAt?.toISOString() ?? null, paidVia: i.paidVia, overdue: i.status === 'open' && due < today };
  }

  // ------------------------------------------------------------------ subscribe / change plan
  async subscribe(user: { id: string; name: string; email: string }, input: { planId: string; method?: BillingMethod; profile?: BillingProfile }): Promise<BillingView> {
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan || !plan.active) throw new DomainNotFound('not_found', 'Plano não encontrado');
    const sub = await this.prisma.subscription.findUnique({ where: { userId: user.id }, include: { plan: true, invoices: { where: { status: 'open' } } } });
    const today = this.today();
    const current = sub?.plan ?? (await this.defaultPlan());
    if (current?.id === plan.id && (plan.priceCents === 0 || sub?.providerSubscriptionId)) throw new DomainBadRequest('bad_request', 'Você já está neste plano.');
    if (sub?.invoices.some((i) => fromDbDate(i.dueDate) < today)) throw new DomainForbidden('account_blocked', 'Pague a mensalidade em atraso antes de mudar de plano.');
    const fit = planFitProblem(plan, await this.usage(user.id));
    if (fit) throw new DomainBadRequest('plan_limit', fit, { kind: 'fit' });

    const provider = sub?.providerSubscriptionId || plan.priceCents > 0 ? await this.provider() : null;

    if (plan.priceCents === 0) {
      if (sub?.providerSubscriptionId) await this.cancelProvider(provider!, sub.providerSubscriptionId);
      await this.prisma.$transaction([
        this.prisma.invoice.updateMany({ where: { subscriptionId: sub?.id ?? '-', status: 'open' }, data: { status: 'void' } }),
        this.prisma.subscription.upsert({
          where: { userId: user.id },
          create: { userId: user.id, planId: plan.id },
          update: { planId: plan.id, method: null, providerSubscriptionId: null, providerIdempotencyKey: null, nextDueDate: null, status: 'ok', blockedAt: null },
        }),
      ]);
      return this.view(user.id);
    }

    if (!input.method || !input.profile) throw new DomainBadRequest('validation_error', 'Informe a forma de pagamento e os dados de cobrança.');
    // Current period already paid → the new plan bills from the next due date; otherwise from today.
    const nextDue = sub?.nextDueDate ? fromDbDate(sub.nextDueDate) : null;
    const firstDue = sub?.providerSubscriptionId && !sub.invoices.length && nextDue && nextDue > today ? nextDue : today;
    if (sub?.providerSubscriptionId) await this.cancelProvider(provider!, sub.providerSubscriptionId);
    if (sub) await this.prisma.invoice.updateMany({ where: { subscriptionId: sub.id, status: 'open' }, data: { status: 'void' } });

    // Persist the idempotency key BEFORE calling: a retry after a timeout replays the same subscription.
    const key = `tenace-sub-${user.id}-${plan.id}-${input.method}-${firstDue}-${sub?.updatedAt.getTime() ?? 0}`;
    const row = await this.prisma.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, providerIdempotencyKey: key, billingProfile: input.profile as unknown as Prisma.InputJsonValue },
      update: { providerIdempotencyKey: key, providerSubscriptionId: null, billingProfile: input.profile as unknown as Prisma.InputJsonValue },
    });
    let info;
    try {
      info = await provider!.createSubscription({
        idempotencyKey: key,
        name: `Tenace ${plan.name}`,
        description: `Assinatura Tenace — plano ${plan.name}`,
        amountCents: plan.priceCents,
        method: input.method,
        firstDueDate: firstDue,
        intervalMonths: plan.intervalMonths,
        advanceDays: input.method === 'boleto' ? 5 : 3,
        customer: this.customer(input.profile),
        callbackUrl: `${this.envs.env.APP_WEB_URL.replace(/\/+$/, '')}/api/webhooks/calebepay`,
      });
    } catch (e) {
      throw this.providerError(e, 'Não foi possível criar a assinatura na Calebe Pay.');
    }
    await this.prisma.subscription.update({
      where: { id: row.id },
      data: { planId: plan.id, method: input.method, providerSubscriptionId: info.id, livemode: info.livemode, nextDueDate: info.nextDueDate ? toDbDate(info.nextDueDate) : null, providerIdempotencyKey: null },
    });
    await this.syncUser(user.id).catch((e) => this.logger.warn(`sync after subscribe: ${(e as Error).message}`));
    return this.view(user.id);
  }

  private customer(p: BillingProfile): PaymentCustomer {
    return { name: p.name, document: p.document, email: p.email, phone: p.phone, address: p.address };
  }

  private async provider(): Promise<PaymentProvider> {
    if (!(await this.payments.isReady())) throw new DomainUnavailable('billing_unavailable', 'Pagamentos ainda não estão disponíveis. Tente mais tarde.');
    return this.payments.provider();
  }

  private async cancelProvider(provider: PaymentProvider, id: string): Promise<void> {
    try {
      await provider.cancelSubscription(id);
    } catch (e) {
      if (e instanceof OutboundError && (e.status === 404 || e.status === 409)) return; // gone or already cancelled
      throw this.providerError(e, 'Não foi possível cancelar a assinatura atual na Calebe Pay.');
    }
  }

  private providerError(e: unknown, message: string) {
    this.logger.error(`${message} ${(e as Error).message}`);
    const status = e instanceof OutboundError ? e.status : undefined;
    if (status === 422) {
      const body = (e as OutboundError).body as { error?: { message?: string } } | undefined;
      return new DomainBadRequest('validation_error', body?.error?.message ? `Calebe Pay: ${body.error.message}` : message);
    }
    return new DomainUnavailable('billing_unavailable', message);
  }

  // ------------------------------------------------------------------ pay an invoice
  /**
   * Returns where to pay. On time, the cycle's own Pix/boleto link. Late (the cycle link
   * expired) or by card: a Calebe Pay checkout for that invoice (Pix, boleto or card), due today.
   */
  async payInvoice(userId: string, invoiceId: string, mode: 'default' | 'checkout'): Promise<{ url: string }> {
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, userId }, include: { subscription: true } });
    if (!inv) throw new DomainNotFound('not_found', 'Fatura não encontrada');
    if (inv.status !== 'open') throw new DomainBadRequest('invoice_not_payable', inv.status === 'paid' ? 'Esta fatura já está paga.' : 'Esta fatura foi cancelada.');
    const today = this.today();
    const due = fromDbDate(inv.dueDate);
    if (mode === 'default' && due >= today && inv.paymentUrl) return { url: inv.paymentUrl };
    if (inv.checkoutUrl && inv.checkoutDueDate && fromDbDate(inv.checkoutDueDate) >= today) return { url: inv.checkoutUrl };
    const profile = inv.subscription.billingProfile as BillingProfile | null;
    if (!profile) throw new DomainBadRequest('validation_error', 'Complete seus dados de cobrança na assinatura.');
    const provider = await this.provider();
    const checkoutDue = due >= today ? due : today;
    const web = this.envs.env.APP_WEB_URL.replace(/\/+$/, '');
    const create = async (methods: ('pix' | 'boleto' | 'credit_card')[], suffix: string) => {
      const key = `tinv-${inv.id}-${checkoutDue}${suffix}`;
      await this.prisma.invoice.update({ where: { id: inv.id }, data: { checkoutKey: key } });
      return provider.createCheckout({
        reference: `tinv-${inv.id}`,
        idempotencyKey: key,
        amountCents: inv.amountCents,
        description: `Tenace — mensalidade de ${shortDate(due)}`,
        methods,
        dueDate: checkoutDue,
        customer: this.customer(profile),
        returnUrl: `${web}/assinatura?pago=1`,
        callbackUrl: `${web}/api/webhooks/calebepay`,
      });
    };
    let checkout;
    try {
      checkout = await create(['pix', 'boleto', 'credit_card'], '');
    } catch (e) {
      // Account without card routing: offer Pix and boleto only.
      if (e instanceof OutboundError && e.status === 422) checkout = await create(['pix', 'boleto'], '-pb').catch((e2: unknown) => Promise.reject(this.providerError(e2, 'Não foi possível gerar o pagamento.')));
      else throw this.providerError(e, 'Não foi possível gerar o pagamento.');
    }
    await this.prisma.invoice.update({ where: { id: inv.id }, data: { checkoutId: checkout.providerCheckoutId, checkoutUrl: checkout.checkoutUrl, checkoutDueDate: toDbDate(checkoutDue) } });
    return { url: checkout.checkoutUrl };
  }

  // ------------------------------------------------------------------ sync (pull) and events (push)
  /** Pulls cycles and payments from Calebe Pay (works even without webhooks). Idempotent. */
  async syncUser(userId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
    if (!sub) return;
    if (sub.providerSubscriptionId && (await this.payments.isReady())) {
      const provider = await this.payments.provider();
      const [info, cycles] = await Promise.all([provider.getSubscription(sub.providerSubscriptionId), provider.listCycles(sub.providerSubscriptionId)]);
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { nextDueDate: info.nextDueDate ? toDbDate(info.nextDueDate) : null } });
      for (const c of cycles) {
        if (c.status === 'skipped') continue;
        const inv = await this.upsertCycle(sub, sub.providerSubscriptionId, c.dueDate, c.amountCents, c.cycle, c.paymentUrl);
        if (c.transactionStatus === 'paid' && c.transactionId && inv.status !== 'paid') await this.confirmPayment(inv.id, c.transactionId, 'subscription', provider);
      }
    }
    // Checkouts opened for late/card payments.
    const pending = await this.prisma.invoice.findMany({ where: { userId, status: { in: ['open', 'void'] }, checkoutId: { not: null } } });
    if (pending.length && (await this.payments.isReady())) {
      const provider = await this.payments.provider();
      for (const inv of pending) {
        const ck = await provider.getCheckout(inv.checkoutId!).catch(() => null);
        if (ck?.transactionId) await this.confirmPayment(inv.id, ck.transactionId, 'checkout', provider);
      }
    }
    await this.evaluate(userId);
  }

  private async upsertCycle(sub: SubWithPlan | Subscription, providerSubscriptionId: string, dueDate: string, amountCents: number, cycle: number | null, paymentUrl: string | null): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({ where: { providerSubscriptionId_dueDate: { providerSubscriptionId, dueDate: toDbDate(dueDate) } } });
    if (existing) {
      if (paymentUrl && existing.paymentUrl !== paymentUrl) return this.prisma.invoice.update({ where: { id: existing.id }, data: { paymentUrl } });
      return existing;
    }
    const inv = await this.prisma.invoice.create({
      data: { subscriptionId: sub.id, userId: sub.userId, providerSubscriptionId, cycle, amountCents, dueDate: toDbDate(dueDate), providerReference: `${providerSubscriptionId}:${dueDate}`, paymentUrl },
    });
    await this.notify.users([sub.userId], { type: 'invoice_created', title: `Mensalidade do Tenace: ${formatCents(amountCents)}`, body: `Vence em ${shortDate(dueDate)}. Pague por Pix, boleto ou cartão.`, link: '/assinatura' });
    return inv;
  }

  /** Verifies the transaction on Calebe Pay (never trusts the event body) and marks the invoice paid. */
  private async confirmPayment(invoiceId: string, transactionId: string, via: string, provider: PaymentProvider): Promise<boolean> {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.status === 'paid') return false;
    const t = await provider.getTransaction(transactionId);
    const modeOk = provider.testMode ? !t.livemode : t.livemode && !t.simulated;
    if (t.status !== 'paid' || t.amountCents < inv.amountCents || !modeOk) return false;
    const updated = await this.prisma.invoice.updateMany({ where: { id: inv.id, status: { not: 'paid' } }, data: { status: 'paid', paidAt: new Date(), paidVia: via, paidTransactionId: t.id } });
    if (!updated.count) return false;
    if (inv.status === 'void') this.logger.warn(`void invoice ${inv.id} was paid (tx ${t.id}) — review for refund`);
    await this.notify.users([inv.userId], { type: 'invoice_paid', title: 'Pagamento confirmado ✅', body: `Mensalidade de ${formatCents(inv.amountCents)} paga. Obrigado!`, link: '/assinatura' });
    await this.evaluate(inv.userId);
    return true;
  }

  async handleEvent(e: CalebeEvent): Promise<void> {
    const d = e.data ?? {};
    if (!(await this.payments.isReady())) return;
    const provider = await this.payments.provider();
    if (e.type === 'subscription.cycle_created' && d.subscription_id && d.due_date) {
      const sub = await this.prisma.subscription.findUnique({ where: { providerSubscriptionId: d.subscription_id } });
      if (!sub) return;
      if (d.status !== 'skipped') await this.upsertCycle(sub, d.subscription_id, d.due_date, Number(d.amount ?? 0), d.cycle ?? null, d.payment_url ?? null);
      await this.evaluate(sub.userId);
      return;
    }
    if ((e.type === 'transaction.created' || e.type === 'transaction.updated') && d.status === 'paid' && d.id && d.reference) {
      const ck = CHECKOUT_REF.exec(d.reference);
      if (ck) {
        await this.confirmPayment(ck[1]!, d.id, 'checkout', provider);
        return;
      }
      const cy = CYCLE_REF.exec(d.reference);
      if (cy) {
        let inv = await this.prisma.invoice.findUnique({ where: { providerReference: d.reference } });
        if (!inv) {
          const sub = await this.prisma.subscription.findUnique({ where: { providerSubscriptionId: cy[1]! } });
          if (sub) await this.syncUser(sub.userId);
          inv = await this.prisma.invoice.findUnique({ where: { providerReference: d.reference } });
        }
        if (inv) await this.confirmPayment(inv.id, d.id, 'subscription', provider);
      }
    }
  }

  /** Every 10 min: pull subscriptions with something pending and move statuses as days pass. */
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`;
      if (!rows[0]?.locked) return;
      try {
        const soon = toDbDate(addDays(this.today(now), 1));
        const subs = await this.prisma.subscription.findMany({
          where: { OR: [{ status: { not: 'ok' } }, { invoices: { some: { status: 'open' } } }, { providerSubscriptionId: { not: null }, nextDueDate: { lte: soon } }] },
          select: { userId: true },
        });
        for (const s of subs) await this.syncUser(s.userId).catch((e) => this.logger.error(`sync ${s.userId}: ${(e as Error).message}`));
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
      }
    } catch (e) {
      this.logger.error(`billing tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  // ------------------------------------------------------------------ admin
  async savePlan(id: string | null, input: Omit<PlanView, 'id'>): Promise<PlanView> {
    if (input.isDefault && input.priceCents > 0) throw new DomainBadRequest('validation_error', 'O plano padrão precisa ser grátis.');
    const plan = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.plan.updateMany({ where: { isDefault: true, ...(id ? { id: { not: id } } : {}) }, data: { isDefault: false } });
      return id ? tx.plan.update({ where: { id }, data: input }) : tx.plan.create({ data: input });
    });
    return planView(plan);
  }
}
