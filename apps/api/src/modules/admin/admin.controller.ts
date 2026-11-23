import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { randomToken, sha256 } from '../../common/crypto';
import { EnvService } from '../../common/env.service';
import { DomainBadRequest, DomainForbidden, DomainNotFound } from '../../common/errors/domain-exceptions';
import { MailService } from '../../common/mail.service';
import { PrismaService } from '../../common/prisma.service';
import type { AuthedRequest } from '../../common/request';
import { parseBody } from '../../common/validation';
import { hashPassword, passwordProblem } from '../auth/password';
import { BillingService } from '../billing/billing.service';
import { CalebePayProvider } from '../integrations/calebepay.provider';
import { INTEGRATION_KEYS, IntegrationsService, isIntegrationKey, updateIntegrationSchema } from '../integrations/integrations.service';

/** Platform staff only (system role). Group roles do not grant anything here. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (req.user?.role !== 'platform_admin') throw new DomainNotFound('not_found', 'Não encontrado');
    return true;
  }
}

const RESET_LINK_HOURS = 24;

@Controller('admin')
@UseGuards(PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrations: IntegrationsService,
    private readonly mail: MailService,
    private readonly envs: EnvService,
    private readonly billing: BillingService,
  ) {}

  @Get('overview')
  async overview() {
    const [users, groups, openWeeks, webhooks] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.group.count({ where: { archivedAt: null } }),
      this.prisma.week.count({ where: { status: 'open' } }),
      this.prisma.webhookEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: 10, select: { id: true, type: true, livemode: true, receivedAt: true, processedAt: true, error: true } }),
    ]);
    return {
      users,
      groups,
      openWeeks,
      mailChannel: await this.mail.channel(),
      webhookUrl: `${this.envs.env.APP_WEB_URL}/api/webhooks/calebepay`,
      recentWebhooks: webhooks.map((w) => ({ ...w, receivedAt: w.receivedAt.toISOString(), processedAt: w.processedAt?.toISOString() ?? null })),
      build: this.envs.env.BUILD_SHA || 'dev',
    };
  }

  // ---------------------------------------------------------------- users
  @Get('users')
  async users(@Query('q') q?: string) {
    const term = (q ?? '').trim().slice(0, 100);
    const rows = await this.prisma.user.findMany({
      where: term ? { OR: [{ email: { contains: term, mode: 'insensitive' } }, { name: { contains: term, mode: 'insensitive' } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { members: { where: { status: { in: ['active', 'leaving'] } } } } },
        subscription: { select: { status: true, providerSubscriptionId: true, trialUntil: true, plan: { select: { name: true } }, trialPlan: { select: { id: true, name: true } } } },
      },
    });
    const defaultPlan = await this.billing.defaultPlan();
    const today = this.billing.today();
    return {
      users: rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        avatarColor: u.avatarColor,
        groups: u._count.members,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        plan: u.subscription?.plan?.name ?? defaultPlan?.name ?? null,
        paid: !!u.subscription?.providerSubscriptionId,
        billingStatus: u.subscription?.status ?? 'ok',
        trial: (() => {
          const until = u.subscription?.trialUntil?.toISOString().slice(0, 10);
          const tp = u.subscription?.trialPlan;
          return tp && until && until >= today ? { planId: tp.id, plan: tp.name, until } : null;
        })(),
      })),
    };
  }

  /** Manual password definition (while e-mail is not configured). Ends every session of that user. */
  @Post('users/:id/password')
  @HttpCode(200)
  async setPassword(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    const { password } = parseBody(z.object({ password: z.string().min(1).max(200) }), body);
    const problem = passwordProblem(password);
    if (problem) throw new DomainBadRequest('validation_error', problem);
    const user = await this.findUser(id);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), authVersion: { increment: 1 } } });
    await this.audit.log(req, 'set_password', 'user', user.id);
    return { ok: true };
  }

  /** Single-use reset link to send by WhatsApp or any channel. */
  @Post('users/:id/reset-link')
  async resetLink(@Req() req: AuthedRequest, @Param('id') id: string) {
    const user = await this.findUser(id);
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + RESET_LINK_HOURS * 3600_000);
    await this.prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt } });
    await this.audit.log(req, 'reset_link', 'user', user.id);
    return { url: `${this.envs.env.APP_WEB_URL}/redefinir-senha?token=${token}`, expiresAt: expiresAt.toISOString() };
  }

  @Patch('users/:id')
  async updateUser(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(z.object({ active: z.boolean().optional(), role: z.enum(['user', 'platform_admin']).optional() }), body);
    const user = await this.findUser(id);
    if (user.id === req.user!.id && (input.active === false || input.role === 'user')) throw new DomainForbidden('forbidden', 'Você não pode bloquear nem rebaixar a si mesmo');
    await this.prisma.user.update({
      where: { id: user.id },
      // Blocking bumps authVersion so open sessions end immediately.
      data: { ...input, ...(input.active === false ? { authVersion: { increment: 1 } } : {}) },
    });
    await this.audit.log(req, 'update', 'user', user.id, input);
    return { ok: true };
  }

  private async findUser(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new DomainNotFound('not_found', 'Usuário não encontrado');
    return u;
  }

  // ---------------------------------------------------------------- groups (read-only, platform staff)
  @Get('groups')
  async groups(@Query('q') q?: string, @Query('status') status?: string) {
    const term = (q ?? '').trim().slice(0, 100);
    const where: Prisma.GroupWhereInput = {
      ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { members: { some: { role: 'owner', user: { OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] } } } }] } : {}),
      ...(status === 'archived' ? { archivedAt: { not: null } } : status === 'active' || status === 'paused' ? { archivedAt: null } : {}),
    };
    const rows = await this.prisma.group.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        members: { where: { role: 'owner', status: { in: ['active', 'leaving'] } }, select: { userId: true, user: { select: { name: true, email: true } } }, take: 1 },
        _count: { select: { members: { where: { status: { in: ['active', 'leaving'] } } }, goals: { where: { archivedAt: null } } } },
      },
    });
    const planNames = new Map<string, string | null>();
    const blocked = new Map<string, boolean>();
    const out = [];
    for (const g of rows) {
      const owner = g.members[0] ?? null;
      if (owner && !planNames.has(owner.userId)) {
        planNames.set(owner.userId, (await this.billing.planFor(owner.userId))?.name ?? null);
        blocked.set(owner.userId, await this.billing.isUserBlocked(owner.userId));
      }
      const state = g.archivedAt ? 'archived' : g.billingPausedAt || (owner && blocked.get(owner.userId)) ? 'paused_billing' : g.planPausedAt ? 'paused_plan' : 'active';
      if (status === 'paused' && !state.startsWith('paused')) continue;
      if (status === 'active' && state !== 'active') continue;
      out.push({
        id: g.id,
        name: g.name,
        emoji: g.emoji,
        color: g.color,
        createdAt: g.createdAt.toISOString(),
        archivedAt: g.archivedAt?.toISOString() ?? null,
        owner: owner ? { id: owner.userId, name: owner.user.name, email: owner.user.email } : null,
        ownerPlan: owner ? (planNames.get(owner.userId) ?? null) : null,
        members: g._count.members,
        goals: g._count.goals,
        state,
      });
    }
    return { groups: out, total: out.length };
  }

  @Get('groups/:id')
  async group(@Req() req: AuthedRequest, @Param('id') id: string) {
    const g = await this.prisma.group.findUnique({
      where: { id },
      include: {
        members: { where: { status: { in: ['active', 'leaving'] } }, include: { user: { select: { name: true, email: true, avatarColor: true } } }, orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }] },
        goals: { where: { archivedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!g) throw new DomainNotFound('not_found', 'Grupo não encontrado');
    const [weeksClosed, lastWeek] = await Promise.all([
      this.prisma.week.count({ where: { groupId: g.id, status: 'closed' } }),
      this.prisma.week.findFirst({ where: { groupId: g.id }, orderBy: { weekStart: 'desc' }, select: { weekStart: true, status: true } }),
    ]);
    await this.audit.log(req, 'view', 'group', g.id);
    return {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      description: g.description,
      timezone: g.timezone,
      startsOn: g.startsOn.toISOString().slice(0, 10),
      createdAt: g.createdAt.toISOString(),
      weeksClosed,
      lastWeek: lastWeek ? { weekStart: lastWeek.weekStart.toISOString().slice(0, 10), status: lastWeek.status } : null,
      members: g.members.map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, avatarColor: m.user.avatarColor, role: m.role, status: m.status, joinedAt: m.joinedAt.toISOString(), streak: m.streak })),
      goals: g.goals.map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, period: x.period, target: x.target, unit: x.unit, stakeCents: x.stakeCents, slotsPerWeek: x.slotsPerWeek })),
    };
  }

  // ---------------------------------------------------------------- integrations
  @Get('integrations')
  async listIntegrations() {
    return {
      items: await Promise.all(INTEGRATION_KEYS.map((k) => this.integrations.publicView(k))),
      webhookUrl: `${this.envs.env.APP_WEB_URL}/api/webhooks/calebepay`,
      mailChannel: await this.mail.channel(),
    };
  }

  @Put('integrations/:key')
  async updateIntegration(@Req() req: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    if (!isIntegrationKey(key)) throw new DomainNotFound('not_found', 'Integração desconhecida');
    const input = parseBody(updateIntegrationSchema, body);
    const view = await this.integrations.update(key, input, req.user!.id);
    // Which secrets changed, never their values.
    await this.audit.log(req, 'update', 'integration', key, { enabled: input.enabled, secretsChanged: Object.keys(input.secrets) });
    return view;
  }

  /** Cost centers available for the saved Calebe Pay key (to pick where Tenace charges land). */
  @Get('integrations/calebepay/cost-centers')
  async costCenters() {
    const cp = await this.integrations.load('calebepay');
    if (!cp.secrets.apiKey) throw new DomainBadRequest('validation_error', 'Salve a chave de API do Calebe Pay primeiro');
    try {
      return { costCenters: await new CalebePayProvider(cp.config.apiUrl, cp.secrets.apiKey).listCostCenters() };
    } catch (e) {
      throw new DomainBadRequest('billing_unavailable', `Não foi possível listar os centros de custo: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  @Post('integrations/:key/test')
  @HttpCode(200)
  async testIntegration(@Req() req: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { to } = parseBody(z.object({ to: z.string().trim().email().max(254).optional() }), body ?? {});
    try {
      if (key === 'calebepay') {
        const cp = await this.integrations.load('calebepay');
        if (!cp.secrets.apiKey) throw new Error('Informe a chave de API');
        const r = await new CalebePayProvider(cp.config.apiUrl, cp.secrets.apiKey).ping();
        await this.audit.log(req, 'test', 'integration', key, { ok: true });
        return { ok: true, message: r.mode === 'test' ? 'Conectado ao Calebe Pay em modo de TESTE (sandbox)' : 'Conectado ao Calebe Pay em PRODUÇÃO' };
      }
      if (key === 'resend') {
        if (!to) throw new DomainBadRequest('validation_error', 'Informe o e-mail de destino');
        const r = await this.integrations.load('resend');
        if (!r.enabled || !r.secrets.apiKey || !r.config.fromEmail) throw new Error('Ative o Resend e preencha chave e remetente');
        const text = 'Este é um e-mail de teste do Tenace. Se chegou, o Resend está configurado. 💜';
        const id = await this.mail.send({ to, subject: 'Teste de envio — Tenace', text, html: this.mail.html('Teste de envio', text) }, true);
        await this.audit.log(req, 'test', 'integration', key, { ok: true });
        return { ok: true, message: `E-mail enviado pelo Resend (id ${id})` };
      }
      throw new DomainNotFound('not_found', 'Integração sem teste');
    } catch (e) {
      if (e instanceof DomainBadRequest || e instanceof DomainNotFound) throw e;
      return { ok: false, message: (e as Error).message.slice(0, 300) };
    }
  }
}
