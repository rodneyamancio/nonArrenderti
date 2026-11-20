import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { PaymentStatus } from '@prisma/client';
import { formatCents } from '@tenace/rules';
import type { AccountView, FundView, PaymentView } from '@tenace/types';
import { z } from 'zod';
import { DomainBadRequest, DomainForbidden, DomainNotFound } from '../../common/errors/domain-exceptions';
import { NotifyService } from '../../common/notify.service';
import { PrismaService } from '../../common/prisma.service';
import type { AuthedRequest } from '../../common/request';
import { parseBody } from '../../common/validation';
import { GroupGuard, NeedGroup } from './group.guard';
import { ViewsService } from './views.service';

const cents = z.number().int().min(1).max(1_000_000_00);
const paymentSchema = z.object({ amountCents: cents, note: z.string().trim().max(300).default(''), receiptUploadId: z.string().max(40).nullable().default(null), memberId: z.string().max(40).optional() });
const adjustmentSchema = z.object({ memberId: z.string().max(40), amountCents: z.number().int().min(-1_000_000_00).max(1_000_000_00).refine((v) => v !== 0, 'Valor não pode ser zero'), reason: z.string().trim().min(3).max(200) });
const expenseSchema = z.object({ amountCents: cents, description: z.string().trim().min(3).max(200), receiptUploadId: z.string().max(40).nullable().default(null) });

@Controller('groups/:groupId')
@UseGuards(GroupGuard)
export class LedgerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ViewsService,
    private readonly notify: NotifyService,
  ) {}

  /** Statements are visible to every member (transparency inside the group). */
  @Get('account')
  async account(@Req() req: AuthedRequest, @Query('memberId') memberId?: string): Promise<AccountView> {
    const id = memberId || req.member!.id;
    const m = await this.prisma.member.findFirst({ where: { id, groupId: req.group!.id } });
    if (!m) throw new DomainNotFound('not_found', 'Membro não encontrado');
    return this.views.account(req.group!.id, id);
  }

  @Get('fund')
  fund(@Req() req: AuthedRequest): Promise<FundView> {
    return this.views.fund(req.group!.id);
  }

  // ---------------------------------------------------------------- payments
  @Get('payments')
  async payments(@Req() req: AuthedRequest, @Query('status') status?: string): Promise<{ payments: PaymentView[] }> {
    const st = status === 'pending' || status === 'confirmed' || status === 'rejected' ? (status as PaymentStatus) : undefined;
    const where = { groupId: req.group!.id, ...(st ? { status: st } : {}) };
    const rows = await this.prisma.payment.findMany({ where, orderBy: { declaredAt: 'desc' }, take: 100, include: { member: { include: { user: { select: { name: true } } } } } });
    const deciders = new Map((await this.prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => (r.decidedById ? [r.decidedById] : [])) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return {
      payments: rows.map((p) => ({
        id: p.id,
        memberId: p.memberId,
        memberName: p.member.user.name,
        amountCents: p.amountCents,
        status: p.status,
        note: p.note,
        receiptUploadId: p.receiptUploadId,
        declaredAt: p.declaredAt.toISOString(),
        decidedAt: p.decidedAt?.toISOString() ?? null,
        decidedByName: p.decidedById ? (deciders.get(p.decidedById) ?? null) : null,
      })),
    };
  }

  /**
   * A member declares a payment made outside the app (PIX); an admin confirms it.
   * An admin registering a payment for someone else confirms it right away.
   */
  @Post('payments')
  @NeedGroup('ledger:payment:declare')
  async declare(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parseBody(paymentSchema, body);
    const g = req.group!;
    const me = req.member!;
    const forOther = !!input.memberId && input.memberId !== me.id;
    if (forOther && !me.permissions.includes('ledger:payment:confirm')) throw new DomainForbidden('insufficient_permission', 'Só admins registram pagamentos de outras pessoas');
    const memberId = forOther ? input.memberId! : me.id;
    const target = await this.prisma.member.findFirst({ where: { id: memberId, groupId: g.id }, include: { user: true } });
    if (!target) throw new DomainNotFound('not_found', 'Membro não encontrado');
    if (input.receiptUploadId) {
      const up = await this.prisma.upload.findFirst({ where: { id: input.receiptUploadId, groupId: g.id } });
      if (!up) throw new DomainBadRequest('validation_error', 'Comprovante inválido');
    }
    const p = await this.prisma.payment.create({ data: { groupId: g.id, memberId, amountCents: input.amountCents, note: input.note, receiptUploadId: input.receiptUploadId, declaredById: req.user!.id } });
    if (forOther) {
      await this.confirmPayment(req, p.id);
      return { id: p.id, status: 'confirmed' };
    }
    await this.notify.admins(g.id, { type: 'payment', title: `${req.user!.name} informou um pagamento de ${formatCents(input.amountCents)}`, body: `Confirme em ${g.emoji} ${g.name} › Conta.`, link: `/g/${g.id}/conta?tab=pagamentos` }, req.user!.id);
    return { id: p.id, status: 'pending' };
  }

  @Post('payments/:paymentId/confirm')
  @NeedGroup('ledger:payment:confirm')
  @HttpCode(200)
  async confirm(@Req() req: AuthedRequest, @Param('paymentId') id: string) {
    await this.confirmPayment(req, id);
    return { ok: true };
  }

  @Post('payments/:paymentId/reject')
  @NeedGroup('ledger:payment:confirm')
  @HttpCode(200)
  async reject(@Req() req: AuthedRequest, @Param('paymentId') id: string) {
    const p = await this.prisma.payment.findFirst({ where: { id, groupId: req.group!.id }, include: { member: true } });
    if (!p) throw new DomainNotFound('not_found', 'Pagamento não encontrado');
    if (p.status !== 'pending') throw new DomainBadRequest('payment_already_decided', 'Este pagamento já foi decidido');
    await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'rejected', decidedById: req.user!.id, decidedAt: new Date() } });
    await this.notify.users([p.member.userId], { groupId: p.groupId, type: 'payment', title: `Pagamento de ${formatCents(p.amountCents)} não confirmado`, body: 'Fale com um admin do grupo.', link: `/g/${p.groupId}/conta` });
    return { ok: true };
  }

  private async confirmPayment(req: AuthedRequest, id: string) {
    const g = req.group!;
    const p = await this.prisma.payment.findFirst({ where: { id, groupId: g.id }, include: { member: { include: { user: true } } } });
    if (!p) throw new DomainNotFound('not_found', 'Pagamento não encontrado');
    if (p.status !== 'pending') throw new DomainBadRequest('payment_already_decided', 'Este pagamento já foi decidido');
    const own = p.memberId === req.member!.id;
    if (own) {
      const others = await this.prisma.member.count({ where: { groupId: g.id, role: { in: ['owner', 'admin'] }, status: { in: ['active', 'leaving'] }, id: { not: req.member!.id } } });
      if (others > 0) throw new DomainForbidden('self_approval', 'Outro admin precisa confirmar o seu pagamento');
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({ where: { id: p.id, status: 'pending' }, data: { status: 'confirmed', decidedById: req.user!.id, decidedAt: new Date() } });
      if (updated.count !== 1) throw new DomainBadRequest('payment_already_decided', 'Este pagamento já foi decidido');
      await tx.ledgerEntry.create({ data: { groupId: g.id, memberId: p.memberId, type: 'PAYMENT', amountCents: p.amountCents, paymentId: p.id, description: `Pagamento para ${g.destLabel}`, createdById: req.user!.id } });
      await tx.fundEntry.create({
        data: { groupId: g.id, type: 'PAYMENT_RECEIVED', receivableDeltaCents: -p.amountCents, cashDeltaCents: p.amountCents, memberId: p.memberId, paymentId: p.id, description: `Pagamento de ${p.member.user.name}`, receiptUploadId: p.receiptUploadId, createdById: req.user!.id },
      });
    });
    await this.notify.feed(g.id, 'payment_confirmed', `💸 ${p.member.user.name} pagou ${formatCents(p.amountCents)}${own ? ' (confirmado pelo próprio admin)' : ''}`, p.memberId);
    if (!own) await this.notify.users([p.member.userId], { groupId: g.id, type: 'payment', title: `Pagamento de ${formatCents(p.amountCents)} confirmado ✅`, link: `/g/${g.id}/conta` });
  }

  // ---------------------------------------------------------------- adjustments & expenses
  @Post('adjustments')
  @NeedGroup('ledger:adjustment:create')
  async adjust(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parseBody(adjustmentSchema, body);
    const g = req.group!;
    const m = await this.prisma.member.findFirst({ where: { id: input.memberId, groupId: g.id }, include: { user: true } });
    if (!m) throw new DomainNotFound('not_found', 'Membro não encontrado');
    if (m.id === req.member!.id && input.amountCents > 0) {
      const others = await this.prisma.member.count({ where: { groupId: g.id, role: { in: ['owner', 'admin'] }, status: { in: ['active', 'leaving'] }, id: { not: m.id } } });
      if (others > 0) throw new DomainForbidden('self_approval', 'Outro admin precisa abonar a sua conta');
    }
    await this.prisma.$transaction([
      this.prisma.ledgerEntry.create({ data: { groupId: g.id, memberId: m.id, type: 'ADJUSTMENT', amountCents: input.amountCents, description: input.reason, createdById: req.user!.id } }),
      this.prisma.fundEntry.create({
        data: {
          groupId: g.id,
          type: input.amountCents > 0 ? 'WAIVER' : 'PENALTY_ADJUSTED',
          receivableDeltaCents: -input.amountCents,
          memberId: m.id,
          description: `${input.amountCents > 0 ? 'Abono' : 'Cobrança extra'} para ${m.user.name}: ${input.reason}`,
          createdById: req.user!.id,
        },
      }),
    ]);
    await this.notify.users([m.userId], { groupId: g.id, type: 'adjustment', title: `${input.amountCents > 0 ? 'Abono' : 'Ajuste'} de ${formatCents(Math.abs(input.amountCents))} na sua conta`, body: input.reason, link: `/g/${g.id}/conta` });
    return { ok: true };
  }

  @Post('expenses')
  @NeedGroup('fund:expense:create')
  async expense(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parseBody(expenseSchema, body);
    const g = req.group!;
    await this.prisma.fundEntry.create({ data: { groupId: g.id, type: 'EXPENSE', cashDeltaCents: -input.amountCents, description: input.description, receiptUploadId: input.receiptUploadId, createdById: req.user!.id } });
    await this.notify.feed(g.id, 'expense', `registrou uma saída do caixa: ${input.description} (${formatCents(input.amountCents)})`, req.member!.id);
    return { ok: true };
  }
}
