import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { addDays, weekStartOf, localDate } from '@tenace/rules';
import type { GroupDetail, InvitePreview, InviteView, JoinRequestView, MemberView, OverviewGroup } from '@tenace/types';
import { z } from 'zod';
import { randomToken } from '../../common/crypto';
import { EnvService } from '../../common/env.service';
import { DomainBadRequest, DomainForbidden, DomainNotFound } from '../../common/errors/domain-exceptions';
import { MailService } from '../../common/mail.service';
import { NotifyService } from '../../common/notify.service';
import { PrismaService } from '../../common/prisma.service';
import { fromDbDate, iso, toDbDate, type AuthedRequest } from '../../common/request';
import { parseBody } from '../../common/validation';
import { OptionalAuth } from '../auth/auth.guard';
import { BillingService } from '../billing/billing.service';
import { escapeHtml } from '../auth/auth.service';
import { GroupGuard, NeedGroup } from './group.guard';
import { createGroupSchema, updateGroupSchema } from './schemas';
import { ViewsService } from './views.service';
import { WeeksService } from './weeks.service';

const roleSchema = z.object({ role: z.enum(['admin', 'member']) });
const inviteSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('email'), email: z.string().trim().toLowerCase().email().max(254) }),
  z.object({ kind: z.literal('link'), maxUses: z.number().int().min(1).max(100).nullable().default(null) }),
]);

@Controller()
export class GroupsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weeks: WeeksService,
    private readonly views: ViewsService,
    private readonly notify: NotifyService,
    private readonly mail: MailService,
    private readonly envs: EnvService,
    private readonly billing: BillingService,
  ) {}

  // ---------------------------------------------------------------- home
  @Get('me/overview')
  async overview(@Req() req: AuthedRequest): Promise<{ groups: OverviewGroup[] }> {
    const memberships = await this.prisma.member.findMany({
      where: { userId: req.user!.id, status: { in: ['active', 'leaving'] }, group: { archivedAt: null } },
      include: { group: true },
      orderBy: { joinedAt: 'asc' },
    });
    const groups: OverviewGroup[] = [];
    for (const m of memberships) {
      const g = m.group;
      const blocked = !!g.billingPausedAt || (await this.billing.isGroupBlocked(g.id));
      const planPaused = !blocked && !!g.planPausedAt;
      const weekId = await this.weeks.ensureCurrentWeek(g);
      const ws = this.weeks.currentWeekStart(g);
      const week = weekId ? await this.prisma.week.findUnique({ where: { id: weekId } }) : null;
      const today = this.views.today(g);
      const mw = weekId ? await this.prisma.memberWeek.findUnique({ where: { weekId_memberId: { weekId, memberId: m.id } } }) : null;
      const goals = mw ? await this.views.memberWeekGoals(mw.id, today) : [];
      const balances = (await this.views.balances(g.id)).get(m.id) ?? { balance: 0, week: 0 };
      const isAdmin = m.role !== 'member';
      const [memberCount, joinReqs, payments, contests, activeGoals] = await Promise.all([
        this.prisma.member.count({ where: { groupId: g.id, status: { in: ['active', 'leaving'] } } }),
        isAdmin ? this.prisma.joinRequest.count({ where: { groupId: g.id, status: 'pending' } }) : 0,
        isAdmin ? this.prisma.payment.count({ where: { groupId: g.id, status: 'pending' } }) : 0,
        isAdmin ? this.prisma.contest.count({ where: { groupId: g.id, status: 'open' } }) : 0,
        this.prisma.goal.findMany({ where: { groupId: g.id, archivedAt: null }, orderBy: { createdAt: 'asc' } }),
      ]);
      groups.push({
        group: { id: g.id, name: g.name, emoji: g.emoji, color: g.color },
        role: m.role,
        week: this.views.weekInfo(g, ws, week),
        today,
        charged: !!mw,
        startsOnWeek: fromDbDate(m.startsOnWeek),
        goals,
        checkinGoals: blocked || planPaused ? [] : activeGoals.filter((x) => !x.excludedMemberIds.includes(m.id)).map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, unit: x.unit, period: x.period, target: x.target })),
        weekBalanceCents: balances.week,
        openDebtCents: -(balances.balance - balances.week),
        memberCount,
        pendingActions: joinReqs + payments + contests,
        blocked,
        planPaused,
      });
    }
    return { groups };
  }

  // ---------------------------------------------------------------- groups
  @Post('groups')
  async create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parseBody(createGroupSchema, body);
    await this.billing.assertCanCreateGroup(req.user!.id);
    const tz = input.timezone;
    const thisWeek = weekStartOf(localDate(new Date(), tz));
    const startsOn = input.startMode === 'now' ? thisWeek : addDays(thisWeek, 7);
    const d = input.destination;
    const group = await this.prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: {
          name: input.name,
          emoji: input.emoji,
          color: input.color,
          description: input.description,
          timezone: tz,
          startsOn: toDbDate(startsOn),
          destLabel: d.label,
          destHolderName: d.holderName,
          destPixKeyType: d.pixKeyType,
          destPixKey: d.pixKey,
          destBankInfo: d.bankInfo,
          destCity: d.city,
          createdById: req.user!.id,
        },
      });
      await tx.member.create({ data: { groupId: g.id, userId: req.user!.id, role: 'owner', startsOnWeek: toDbDate(startsOn) } });
      for (const goal of input.goals) {
        const { excludedMemberIds: _ignored, ...rest } = goal;
        await tx.goal.create({ data: { ...rest, groupId: g.id } });
      }
      return g;
    });
    if (input.startMode === 'now') await this.weeks.openWeek(group.id, startsOn);
    await this.notify.feed(group.id, 'member_joined', `${req.user!.name} criou o grupo ${group.emoji}`, null);
    return { id: group.id };
  }

  @Get('groups/:groupId')
  @UseGuards(GroupGuard)
  async detail(@Req() req: AuthedRequest): Promise<GroupDetail> {
    const g = req.group!;
    const me = req.member!;
    const isAdmin = me.role !== 'member';
    const [memberCount, pendingJoinRequests, pendingPayments, openContests] = await Promise.all([
      this.prisma.member.count({ where: { groupId: g.id, status: { in: ['active', 'leaving'] } } }),
      isAdmin ? this.prisma.joinRequest.count({ where: { groupId: g.id, status: 'pending' } }) : 0,
      isAdmin ? this.prisma.payment.count({ where: { groupId: g.id, status: 'pending' } }) : 0,
      this.prisma.contest.count({ where: { groupId: g.id, status: 'open' } }),
    ]);
    return {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      color: g.color,
      description: g.description,
      timezone: g.timezone,
      closeGraceHours: g.closeGraceHours,
      startsOn: fromDbDate(g.startsOn),
      destination: this.views.destination(g),
      createdAt: g.createdAt.toISOString(),
      me: { memberId: me.id, role: me.role, status: me.status, permissions: [...me.permissions], startsOnWeek: fromDbDate(me.startsOnWeek) },
      memberCount,
      pendingJoinRequests,
      pendingPayments,
      openContests,
      planPaused: !!g.planPausedAt,
    };
  }

  @Patch('groups/:groupId')
  @UseGuards(GroupGuard)
  @NeedGroup('group:settings:update')
  async update(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parseBody(updateGroupSchema, body);
    const { destination: d, ...rest } = input;
    await this.prisma.group.update({
      where: { id: req.group!.id },
      data: {
        ...rest,
        ...(d ? { destLabel: d.label, destHolderName: d.holderName, destPixKeyType: d.pixKeyType, destPixKey: d.pixKey, destBankInfo: d.bankInfo, destCity: d.city } : {}),
      },
    });
    return { ok: true };
  }

  @Delete('groups/:groupId')
  @UseGuards(GroupGuard)
  @NeedGroup('group:group:delete')
  async archive(@Req() req: AuthedRequest) {
    await this.prisma.group.update({ where: { id: req.group!.id }, data: { archivedAt: new Date() } });
    // A slot in the owner's plan may have freed up for a paused group.
    await this.billing.enforcePlan(req.user!.id); // only the owner archives
    return { ok: true };
  }

  // ---------------------------------------------------------------- members
  @Get('groups/:groupId/members')
  @UseGuards(GroupGuard)
  async members(@Req() req: AuthedRequest): Promise<{ members: MemberView[] }> {
    const ms = await this.prisma.member.findMany({
      where: { groupId: req.group!.id, status: { in: ['active', 'leaving'] } },
      include: { user: { select: { name: true, email: true, avatarColor: true } } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
    return {
      members: ms.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        avatarColor: m.user.avatarColor,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt.toISOString(),
        startsOnWeek: fromDbDate(m.startsOnWeek),
        endsAfterWeek: m.endsAfterWeek ? fromDbDate(m.endsAfterWeek) : null,
        streak: m.streak,
      })),
    };
  }

  @Patch('groups/:groupId/members/:memberId')
  @UseGuards(GroupGuard)
  @NeedGroup('group:role:update')
  async setRole(@Req() req: AuthedRequest, @Param('memberId') memberId: string, @Body() body: unknown) {
    const { role } = parseBody(roleSchema, body);
    const target = await this.findMember(req, memberId);
    if (target.role === 'owner') throw new DomainBadRequest('bad_request', 'Para mudar o dono, use transferir grupo');
    await this.prisma.member.update({ where: { id: target.id }, data: { role } });
    return { ok: true };
  }

  @Post('groups/:groupId/members/:memberId/transfer')
  @UseGuards(GroupGuard)
  @NeedGroup('group:owner:transfer')
  async transfer(@Req() req: AuthedRequest, @Param('memberId') memberId: string) {
    const target = await this.findMember(req, memberId);
    if (target.id === req.member!.id || target.status !== 'active') throw new DomainBadRequest('bad_request', 'Escolha outro membro ativo');
    await this.billing.assertCanReceiveGroup(target.userId, req.group!.id);
    await this.prisma.$transaction([
      this.prisma.member.update({ where: { id: target.id }, data: { role: 'owner' } }),
      this.prisma.member.update({ where: { id: req.member!.id }, data: { role: 'admin' } }),
    ]);
    return { ok: true };
  }

  @Delete('groups/:groupId/members/:memberId')
  @UseGuards(GroupGuard)
  @NeedGroup('group:member:remove')
  async remove(@Req() req: AuthedRequest, @Param('memberId') memberId: string) {
    const target = await this.findMember(req, memberId);
    if (target.role === 'owner') throw new DomainForbidden('owner_cannot_leave', 'O dono não pode ser removido');
    if (target.role === 'admin' && req.member!.role !== 'owner') throw new DomainForbidden('insufficient_permission', 'Só o dono remove admins');
    if (target.id === req.member!.id) throw new DomainBadRequest('bad_request', 'Use "sair do grupo"');
    await this.endMembership(req, target.id, `${target.user.name} foi removido(a) do grupo`);
    return { ok: true };
  }

  @Post('groups/:groupId/leave')
  @UseGuards(GroupGuard)
  @HttpCode(200)
  async leave(@Req() req: AuthedRequest) {
    if (req.member!.role === 'owner') throw new DomainForbidden('owner_cannot_leave', 'Transfira o grupo para outra pessoa antes de sair');
    await this.endMembership(req, req.member!.id, `${req.user!.name} saiu do grupo`);
    return { ok: true };
  }

  /** Leaving takes effect after the current week closes (they still owe this week). */
  private async endMembership(req: AuthedRequest, memberId: string, text: string) {
    const m = await this.prisma.member.findUniqueOrThrow({ where: { id: memberId } });
    const current = this.weeks.currentWeekStart(req.group!);
    // Plan-paused group: no week is charged, so the membership ends now.
    const neverCharged = fromDbDate(m.startsOnWeek) > current || !!req.group!.planPausedAt;
    await this.prisma.member.update({
      where: { id: memberId },
      data: neverCharged ? { status: 'left', endsAfterWeek: null } : { status: 'leaving', endsAfterWeek: toDbDate(current) },
    });
    await this.notify.feed(req.group!.id, 'member_joined', text, req.member!.id);
    if (req.group!.planPausedAt) {
      const owner = await this.ownerId(req.group!.id);
      if (owner) await this.billing.enforcePlan(owner);
    }
  }

  private async ownerId(groupId: string): Promise<string | null> {
    const o = await this.prisma.member.findFirst({ where: { groupId, role: 'owner', status: { in: ['active', 'leaving'] } }, select: { userId: true } });
    return o?.userId ?? null;
  }

  private async findMember(req: AuthedRequest, memberId: string) {
    const m = await this.prisma.member.findFirst({ where: { id: memberId, groupId: req.group!.id, status: { in: ['active', 'leaving'] } }, include: { user: true } });
    if (!m) throw new DomainNotFound('not_found', 'Membro não encontrado');
    return m;
  }

  // ---------------------------------------------------------------- invites
  @Get('groups/:groupId/invites')
  @UseGuards(GroupGuard)
  @NeedGroup('group:member:invite')
  async invites(@Req() req: AuthedRequest): Promise<{ invites: InviteView[] }> {
    const rows = await this.prisma.invite.findMany({ where: { groupId: req.group!.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.createdById) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return {
      invites: rows
        .filter((r) => r.maxUses === null || r.uses < r.maxUses)
        .map((r) => ({ id: r.id, kind: r.kind, email: r.email, token: r.token, uses: r.uses, maxUses: r.maxUses, expiresAt: r.expiresAt.toISOString(), createdByName: users.get(r.createdById) ?? '—', createdAt: r.createdAt.toISOString() })),
    };
  }

  @Post('groups/:groupId/invites')
  @UseGuards(GroupGuard)
  @NeedGroup('group:member:invite')
  async invite(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parseBody(inviteSchema, body);
    const g = req.group!;
    await this.billing.assertCanAddMember(g.id);
    if (input.kind === 'email') {
      const existing = await this.prisma.member.findFirst({ where: { groupId: g.id, status: { in: ['active', 'leaving'] }, user: { email: input.email } } });
      if (existing) throw new DomainBadRequest('already_member', 'Essa pessoa já está no grupo');
    }
    const token = randomToken(18);
    const days = input.kind === 'email' ? 14 : 7;
    const inv = await this.prisma.invite.create({
      data: {
        groupId: g.id,
        kind: input.kind,
        email: input.kind === 'email' ? input.email : null,
        maxUses: input.kind === 'link' ? input.maxUses : 1,
        token,
        createdById: req.user!.id,
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });
    const url = `${this.envs.env.APP_WEB_URL}/convite/${token}`;
    let emailSent = false;
    if (input.kind === 'email') {
      emailSent = !!(await this.mail.send({
        to: input.email,
        subject: `${req.user!.name} te convidou para ${g.name} no Tenace`,
        text: `${req.user!.name} te convidou para o grupo ${g.emoji} ${g.name} no Tenace — metas semanais com um empurrãozinho do grupo. Aceite em: ${url}`,
        html: this.mail.html(
          `Convite para ${escapeHtml(g.emoji)} ${escapeHtml(g.name)}`,
          `${escapeHtml(req.user!.name)} te convidou para o grupo no Tenace: metas semanais, cotas e um caixa para quem não cumprir. Bora?`,
          { label: 'Aceitar convite', url },
        ),
      }));
      const invitee = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (invitee) await this.notify.users([invitee.id], { type: 'invite', title: `Convite para ${g.emoji} ${g.name}`, body: `${req.user!.name} te convidou para o grupo.`, link: `/convite/${token}` });
    }
    return { id: inv.id, token, url, emailSent };
  }

  @Delete('groups/:groupId/invites/:inviteId')
  @UseGuards(GroupGuard)
  @NeedGroup('group:member:invite')
  async revokeInvite(@Req() req: AuthedRequest, @Param('inviteId') inviteId: string) {
    await this.prisma.invite.updateMany({ where: { id: inviteId, groupId: req.group!.id }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  @Get('groups/:groupId/join-requests')
  @UseGuards(GroupGuard)
  @NeedGroup('group:member:approve')
  async joinRequests(@Req() req: AuthedRequest): Promise<{ requests: JoinRequestView[] }> {
    const rows = await this.prisma.joinRequest.findMany({ where: { groupId: req.group!.id, status: 'pending' }, orderBy: { createdAt: 'asc' } });
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } } })).map((u) => [u.id, u]));
    return {
      requests: rows.map((r) => {
        const u = users.get(r.userId);
        return { id: r.id, userId: r.userId, name: u?.name ?? '—', email: u?.email ?? '', avatarColor: u?.avatarColor ?? 'violet', createdAt: r.createdAt.toISOString() };
      }),
    };
  }

  @Post('groups/:groupId/join-requests/:requestId/:decision')
  @UseGuards(GroupGuard)
  @NeedGroup('group:member:approve')
  @HttpCode(200)
  async decide(@Req() req: AuthedRequest, @Param('requestId') requestId: string, @Param('decision') decision: string) {
    if (decision !== 'approve' && decision !== 'reject') throw new DomainNotFound('not_found', 'Ação inválida');
    const jr = await this.prisma.joinRequest.findFirst({ where: { id: requestId, groupId: req.group!.id, status: 'pending' } });
    if (!jr) throw new DomainNotFound('not_found', 'Pedido não encontrado');
    const g = req.group!;
    if (decision === 'approve') await this.billing.assertCanAddMember(g.id);
    await this.prisma.joinRequest.update({ where: { id: jr.id }, data: { status: decision === 'approve' ? 'approved' : 'rejected', decidedById: req.user!.id, decidedAt: new Date() } });
    if (decision === 'approve') {
      await this.addMember(g.id, jr.userId);
      await this.notify.users([jr.userId], { groupId: g.id, type: 'join_approved', title: `Você entrou em ${g.emoji} ${g.name}!`, body: 'Suas metas começam a contar na próxima segunda.', link: `/g/${g.id}` });
    } else {
      await this.notify.users([jr.userId], { groupId: g.id, type: 'join_rejected', title: `Pedido para ${g.name} não aprovado` });
    }
    return { ok: true };
  }

  /** Creates or reactivates a membership; charged from the next Monday (or the group's start). */
  async addMember(groupId: string, userId: string): Promise<string> {
    const g = await this.prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    const startsOnWeek = toDbDate(this.weeks.joinStartWeek(g));
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const m = await this.prisma.member.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId, role: 'member', startsOnWeek },
      update: { status: 'active', role: 'member', startsOnWeek, endsAfterWeek: null, joinedAt: new Date() },
    });
    await this.notify.feed(groupId, 'member_joined', `${user.name} entrou no grupo 👋`, m.id);
    return m.id;
  }

  // ---------------------------------------------------------------- invite links (invitee side)
  private async loadInvite(token: string) {
    if (!token || token.length > 64) return null;
    const inv = await this.prisma.invite.findUnique({ where: { token }, include: { group: true } });
    if (!inv || inv.group.archivedAt) return null;
    const valid = !inv.revokedAt && inv.expiresAt > new Date() && (inv.maxUses === null || inv.uses < inv.maxUses);
    return { inv, valid };
  }

  @Get('invites/:token')
  @OptionalAuth()
  async invitePreview(@Param('token') token: string): Promise<InvitePreview> {
    const found = await this.loadInvite(token);
    if (!found) throw new DomainNotFound('invite_invalid', 'Convite inválido ou expirado');
    const { inv, valid } = found;
    const [memberCount, by] = await Promise.all([
      this.prisma.member.count({ where: { groupId: inv.groupId, status: { in: ['active', 'leaving'] } } }),
      this.prisma.user.findUnique({ where: { id: inv.createdById }, select: { name: true } }),
    ]);
    const g = inv.group;
    return {
      group: { id: g.id, name: g.name, emoji: g.emoji, color: g.color, description: g.description, memberCount },
      kind: inv.kind,
      email: inv.email ? inv.email.replace(/^(.).*(@.*)$/, '$1•••$2') : null,
      invitedBy: by?.name ?? 'Alguém',
      valid,
    };
  }

  @Post('invites/:token/accept')
  @HttpCode(200)
  async acceptInvite(@Req() req: AuthedRequest, @Param('token') token: string): Promise<{ status: 'joined' | 'requested' | 'already_member'; groupId: string }> {
    const found = await this.loadInvite(token);
    if (!found || !found.valid) throw new DomainBadRequest('invite_invalid', 'Convite inválido ou expirado');
    const { inv } = found;
    const user = req.user!;
    const existing = await this.prisma.member.findUnique({ where: { groupId_userId: { groupId: inv.groupId, userId: user.id } } });
    if (existing && ['active', 'leaving'].includes(existing.status)) return { status: 'already_member', groupId: inv.groupId };
    if (inv.kind === 'email') {
      if (inv.email !== user.email) throw new DomainForbidden('invite_email_mismatch', 'Este convite foi enviado para outro e-mail. Entre com a conta certa.');
      await this.billing.assertCanAddMember(inv.groupId);
      await this.prisma.invite.update({ where: { id: inv.id }, data: { uses: { increment: 1 }, revokedAt: new Date() } });
      await this.addMember(inv.groupId, user.id);
      await this.notify.admins(inv.groupId, { type: 'member_joined', title: `${user.name} entrou em ${inv.group.emoji} ${inv.group.name}`, link: `/g/${inv.groupId}/membros` });
      return { status: 'joined', groupId: inv.groupId };
    }
    const pending = await this.prisma.joinRequest.findFirst({ where: { groupId: inv.groupId, userId: user.id, status: 'pending' } });
    if (!pending) {
      await this.billing.assertCanAddMember(inv.groupId);
      await this.prisma.$transaction([
        this.prisma.joinRequest.create({ data: { groupId: inv.groupId, userId: user.id, inviteId: inv.id } }),
        this.prisma.invite.update({ where: { id: inv.id }, data: { uses: { increment: 1 } } }),
      ]);
      await this.notify.admins(inv.groupId, { type: 'join_request', title: `${user.name} quer entrar em ${inv.group.emoji} ${inv.group.name}`, body: 'Aprove ou recuse na aba Membros.', link: `/g/${inv.groupId}/membros` });
    }
    return { status: 'requested', groupId: inv.groupId };
  }

  static iso = iso;
}
