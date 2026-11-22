import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { BillingView, PlanView } from '@tenace/types';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { DomainNotFound } from '../../common/errors/domain-exceptions';
import { PrismaService } from '../../common/prisma.service';
import type { AuthedRequest } from '../../common/request';
import { parseBody } from '../../common/validation';
import { PlatformAdminGuard } from '../admin/admin.controller';
import { Public } from '../auth/auth.guard';
import { AllowBlocked } from './billing.guard';
import { BillingService, planView } from './billing.service';

const digits = (s: string) => s.replace(/\D/g, '');
const profileSchema = z.object({
  name: z.string().trim().min(3).max(100),
  document: z
    .string()
    .transform(digits)
    .refine((d) => d.length === 11 || d.length === 14, 'CPF (11 dígitos) ou CNPJ (14 dígitos)'),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z
    .string()
    .transform(digits)
    .refine((d) => d.length === 10 || d.length === 11, 'Telefone com DDD (10 ou 11 dígitos)'),
  address: z.object({
    zipCode: z.string().transform(digits).refine((d) => d.length === 8, 'CEP com 8 dígitos'),
    street: z.string().trim().min(2).max(120),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(60).optional(),
    district: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'UF com 2 letras'),
  }),
});
const subscribeSchema = z.object({ planId: z.string().min(1).max(40), method: z.enum(['pix', 'boleto']).optional(), profile: profileSchema.optional() });
const paySchema = z.object({ mode: z.enum(['default', 'checkout']).default('default') });
const planSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).default(''),
  priceCents: z.number().int().min(0).max(10_000_000),
  intervalMonths: z.number().int().refine((n) => [1, 3, 6, 12].includes(n), 'Intervalo: 1, 3, 6 ou 12 meses'),
  maxGroups: z.number().int().min(1).max(10_000).nullable(),
  maxMembersPerGroup: z.number().int().min(2).max(10_000).nullable(),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

/** The signed-in user's plan, invoices and payments. Reachable while blocked (to pay). */
@Controller('me/billing')
@AllowBlocked()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  async view(@Req() req: AuthedRequest): Promise<BillingView> {
    return this.billing.view(req.user!.id);
  }

  /** Pulls the latest cycles/payments from Calebe Pay (the page calls it on open and after paying). */
  @Post('sync')
  @HttpCode(200)
  async sync(@Req() req: AuthedRequest): Promise<BillingView> {
    await this.billing.syncUser(req.user!.id).catch(() => undefined);
    return this.billing.view(req.user!.id);
  }

  @Post('subscribe')
  @HttpCode(200)
  async subscribe(@Req() req: AuthedRequest, @Body() body: unknown): Promise<BillingView> {
    const input = parseBody(subscribeSchema, body);
    return this.billing.subscribe(req.user!, input);
  }

  @Post('invoices/:invoiceId/pay')
  @HttpCode(200)
  async pay(@Req() req: AuthedRequest, @Param('invoiceId') invoiceId: string, @Body() body: unknown): Promise<{ url: string }> {
    const { mode } = parseBody(paySchema, body ?? {});
    return this.billing.payInvoice(req.user!.id, invoiceId, mode);
  }
}

/** Public plan list (pricing). */
@Controller('plans')
@Public()
export class PlansController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<{ plans: PlanView[] }> {
    const plans = await this.prisma.plan.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] });
    return { plans: plans.map(planView) };
  }
}

/** Platform admin: plans and who is on them. */
@Controller('admin')
@UseGuards(PlatformAdminGuard)
export class AdminBillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  @Get('plans')
  async plans(): Promise<{ plans: (PlanView & { subscribers: number })[] }> {
    const plans = await this.prisma.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }], include: { _count: { select: { subscriptions: true } } } });
    return { plans: plans.map((p) => ({ ...planView(p), subscribers: p._count.subscriptions })) };
  }

  @Post('plans')
  async createPlan(@Req() req: AuthedRequest, @Body() body: unknown): Promise<PlanView> {
    const plan = await this.billing.savePlan(null, parseBody(planSchema, body));
    await this.audit.log(req, 'plan_create', 'plan', plan.id, { name: plan.name, priceCents: plan.priceCents });
    return plan;
  }

  @Patch('plans/:id')
  async updatePlan(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown): Promise<PlanView> {
    if (!(await this.prisma.plan.findUnique({ where: { id } }))) throw new DomainNotFound('not_found', 'Plano não encontrado');
    const plan = await this.billing.savePlan(id, parseBody(planSchema, body));
    await this.audit.log(req, 'plan_update', 'plan', id, { name: plan.name, priceCents: plan.priceCents });
    return plan;
  }

  @Get('subscriptions')
  async subscriptions() {
    const subs = await this.prisma.subscription.findMany({ where: { OR: [{ planId: { not: null } }, { invoices: { some: {} } }] }, include: { user: { select: { name: true, email: true } }, plan: { select: { name: true } } }, orderBy: { updatedAt: 'desc' }, take: 200 });
    return {
      subscriptions: subs.map((s) => ({ userId: s.userId, name: s.user.name, email: s.user.email, plan: s.plan?.name ?? null, method: s.method, status: s.status, nextDueDate: s.nextDueDate?.toISOString().slice(0, 10) ?? null, livemode: s.livemode, blockedAt: s.blockedAt?.toISOString() ?? null })),
    };
  }
}
