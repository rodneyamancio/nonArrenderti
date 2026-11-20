import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { checkInWindow, formatCents, isTimes } from '@tenace/rules';
import type { CheckInResult, FeedItem } from '@tenace/types';
import { z } from 'zod';
import { DomainBadRequest, DomainForbidden, DomainNotFound } from '../../common/errors/domain-exceptions';
import { NotifyService } from '../../common/notify.service';
import { PrismaService } from '../../common/prisma.service';
import { fromDbDate, shortDate, toDbDate, type AuthedRequest } from '../../common/request';
import { StorageService } from '../../common/storage.service';
import { parseBody } from '../../common/validation';
import { GroupGuard, NeedGroup } from './group.guard';
import { ViewsService } from './views.service';
import { WeeksService } from './weeks.service';

const checkInSchema = z.object({
  goalId: z.string().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().min(1).max(10_000).default(1),
  note: z.string().trim().max(500).default(''),
  photoUploadId: z.string().max(40).nullable().default(null),
});
const REACTIONS = ['👏', '🔥', '💪', '😂', '❤️'] as const;
const CONTEST_DAYS_AFTER_CLOSE = 7;
const MAX_UPLOAD = 5 * 1024 * 1024;

@Controller('groups/:groupId')
@UseGuards(GroupGuard)
export class CheckInsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ViewsService,
    private readonly weeks: WeeksService,
    private readonly notify: NotifyService,
    private readonly storage: StorageService,
  ) {}

  @Post('checkins')
  @NeedGroup('checkin:checkin:create')
  async create(@Req() req: AuthedRequest, @Body() body: unknown): Promise<CheckInResult> {
    const input = parseBody(checkInSchema, body);
    const g = req.group!;
    const me = req.member!;
    const goal = await this.prisma.goal.findFirst({ where: { id: input.goalId, groupId: g.id } });
    if (!goal) throw new DomainNotFound('not_found', 'Meta não encontrada');
    if (goal.archivedAt) throw new DomainBadRequest('goal_archived', 'Esta meta foi encerrada');
    if (goal.excludedMemberIds.includes(me.id)) throw new DomainForbidden('goal_not_participant', 'Você não participa desta meta');
    const now = new Date();
    const win = checkInWindow(input.date, now, g.timezone, g.closeGraceHours);
    if (!win.ok) throw new DomainBadRequest('checkin_outside_window', win.reason === 'future' ? 'Não dá para registrar no futuro 😉' : 'Essa semana já fechou');
    if (fromDbDate(g.startsOn) > win.weekStart) throw new DomainBadRequest('group_not_started', `O grupo começa em ${shortDate(fromDbDate(g.startsOn))}`);
    if (input.photoUploadId) {
      const up = await this.prisma.upload.findFirst({ where: { id: input.photoUploadId, groupId: g.id, uploadedBy: req.user!.id } });
      if (!up) throw new DomainBadRequest('validation_error', 'Foto inválida');
    }
    let week = await this.prisma.week.findUnique({ where: { groupId_weekStart: { groupId: g.id, weekStart: toDbDate(win.weekStart) } } });
    if (!week && win.weekStart === this.weeks.currentWeekStart(g, now)) {
      await this.weeks.ensureCurrentWeek(g, now);
      week = await this.prisma.week.findUnique({ where: { groupId_weekStart: { groupId: g.id, weekStart: toDbDate(win.weekStart) } } });
    }
    if (week?.status === 'closed') throw new DomainBadRequest('checkin_outside_window', 'Essa semana já fechou');
    const quantity = isTimes(goal.unit) ? 1 : input.quantity;

    const { checkInId, weekGoalId, delta } = await this.prisma.$transaction(async (tx) => {
      const c = await tx.checkIn.create({ data: { groupId: g.id, memberId: me.id, goalId: goal.id, date: toDbDate(input.date), quantity, note: input.note, photoUploadId: input.photoUploadId } });
      if (!week) return { checkInId: c.id, weekGoalId: null, delta: 0 };
      const r = await this.weeks.attachCheckIn(tx, c.id, week.id);
      return { checkInId: c.id, ...r };
    });
    const what = isTimes(goal.unit) ? '' : ` · ${quantity} ${goal.unit}`;
    await this.notify.feed(g.id, 'checkin', `registrou ${goal.emoji} ${goal.name}${what}${delta > 0 ? ` (+${formatCents(delta)})` : ''}`, me.id, checkInId);
    const view = (await this.views.checkIns([checkInId], me.id)).get(checkInId)!;
    const today = this.views.today(g, now);
    return { checkIn: view, counted: !!weekGoalId, slotDeltaCents: delta, goal: weekGoalId ? await this.views.weekGoalView(weekGoalId, today) : null };
  }

  @Delete('checkins/:checkInId')
  async remove(@Req() req: AuthedRequest, @Param('checkInId') id: string) {
    const c = await this.prisma.checkIn.findFirst({ where: { id, groupId: req.group!.id, memberId: req.member!.id, status: 'valid' }, include: { week: true } });
    if (!c) throw new DomainNotFound('not_found', 'Registro não encontrado');
    if (c.week?.status === 'closed') throw new DomainBadRequest('checkin_outside_window', 'A semana deste registro já fechou');
    await this.prisma.$transaction(async (tx) => {
      await tx.checkIn.update({ where: { id: c.id }, data: { status: 'deleted', deletedAt: new Date() } });
      if (c.weekGoalId) await this.weeks.recompute(tx, c.weekGoalId, req.user!.id, 'registro apagado');
    });
    await this.prisma.feedEvent.deleteMany({ where: { checkInId: c.id, type: 'checkin' } });
    return { ok: true };
  }

  // ---------------------------------------------------------------- feed
  @Get('feed')
  async feed(@Req() req: AuthedRequest, @Query('before') before?: string, @Query('memberId') memberId?: string): Promise<{ items: FeedItem[]; nextBefore: string | null }> {
    const take = 30;
    const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined;
    const rows = await this.prisma.feedEvent.findMany({
      where: { groupId: req.group!.id, ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}), ...(memberId ? { actorMemberId: memberId } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    });
    const checkIns = await this.views.checkIns(rows.flatMap((r) => (r.checkInId ? [r.checkInId] : [])), req.member!.id);
    const actorIds = [...new Set(rows.flatMap((r) => (r.actorMemberId ? [r.actorMemberId] : [])))];
    const actors = new Map((await this.prisma.member.findMany({ where: { id: { in: actorIds } }, include: { user: { select: { name: true, avatarColor: true } } } })).map((m) => [m.id, m.user]));
    const items: FeedItem[] = rows
      .map((r) => ({
        id: r.id,
        type: r.type as FeedItem['type'],
        createdAt: r.createdAt.toISOString(),
        actorName: r.actorMemberId ? (actors.get(r.actorMemberId)?.name ?? null) : null,
        actorColor: r.actorMemberId ? (actors.get(r.actorMemberId)?.avatarColor ?? null) : null,
        text: r.text,
        checkIn: r.checkInId ? (checkIns.get(r.checkInId) ?? null) : null,
      }))
      .filter((i) => i.type !== 'checkin' || (i.checkIn && i.checkIn.status !== 'deleted'));
    return { items, nextBefore: rows.length === take ? rows[rows.length - 1]!.createdAt.toISOString() : null };
  }

  @Post('checkins/:checkInId/reactions')
  @HttpCode(200)
  async react(@Req() req: AuthedRequest, @Param('checkInId') id: string, @Body() body: unknown) {
    const { emoji } = parseBody(z.object({ emoji: z.enum(REACTIONS) }), body);
    const c = await this.prisma.checkIn.findFirst({ where: { id, groupId: req.group!.id } });
    if (!c) throw new DomainNotFound('not_found', 'Registro não encontrado');
    const key = { checkInId_memberId_emoji: { checkInId: id, memberId: req.member!.id, emoji } };
    const existing = await this.prisma.reaction.findUnique({ where: key });
    if (existing) await this.prisma.reaction.delete({ where: { id: existing.id } });
    else await this.prisma.reaction.create({ data: { checkInId: id, memberId: req.member!.id, emoji } });
    return { reacted: !existing };
  }

  // ---------------------------------------------------------------- contests
  @Post('checkins/:checkInId/contests')
  @NeedGroup('checkin:contest:create')
  async contest(@Req() req: AuthedRequest, @Param('checkInId') id: string, @Body() body: unknown) {
    const { reason } = parseBody(z.object({ reason: z.string().trim().min(3).max(300) }), body);
    const c = await this.prisma.checkIn.findFirst({ where: { id, groupId: req.group!.id, status: 'valid' }, include: { week: true, member: { include: { user: true } }, goal: true } });
    if (!c) throw new DomainNotFound('not_found', 'Registro não encontrado');
    if (c.memberId === req.member!.id) throw new DomainBadRequest('bad_request', 'Você não pode contestar o próprio registro');
    if (c.week?.closedAt && c.week.closedAt.getTime() + CONTEST_DAYS_AFTER_CLOSE * 86_400_000 < Date.now()) throw new DomainBadRequest('bad_request', 'O prazo para contestar este registro acabou');
    const open = await this.prisma.contest.findFirst({ where: { checkInId: id, status: 'open' } });
    if (open) throw new DomainBadRequest('conflict', 'Já existe uma contestação aberta para este registro');
    const ct = await this.prisma.contest.create({ data: { groupId: req.group!.id, checkInId: id, openedByMemberId: req.member!.id, reason } });
    const g = req.group!;
    await this.notify.feed(g.id, 'contest_opened', `contestou o registro de ${c.member.user.name} (${c.goal.emoji} ${c.goal.name}): “${reason}”`, req.member!.id, c.id);
    await this.notify.users([c.member.userId], { groupId: g.id, type: 'contest', title: `Seu registro foi contestado em ${g.emoji} ${g.name}`, body: reason, link: `/g/${g.id}/feed` });
    await this.notify.admins(g.id, { type: 'contest', title: `Contestação para decidir em ${g.emoji} ${g.name}`, body: reason, link: `/g/${g.id}/feed` }, req.user!.id);
    return { id: ct.id };
  }

  @Post('contests/:contestId/resolve')
  @NeedGroup('checkin:contest:resolve')
  @HttpCode(200)
  async resolve(@Req() req: AuthedRequest, @Param('contestId') id: string, @Body() body: unknown) {
    const input = parseBody(z.object({ decision: z.enum(['uphold', 'dismiss']), note: z.string().trim().max(300).default('') }), body);
    const g = req.group!;
    const ct = await this.prisma.contest.findFirst({ where: { id, groupId: g.id, status: 'open' }, include: { checkIn: { include: { member: { include: { user: true } }, goal: true } } } });
    if (!ct) throw new DomainNotFound('not_found', 'Contestação não encontrada');
    if (ct.checkIn.memberId === req.member!.id && (await this.otherAdmins(g.id, req.member!.id)) > 0) {
      throw new DomainForbidden('self_approval', 'Outro admin precisa decidir sobre o seu próprio registro');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.contest.update({ where: { id: ct.id }, data: { status: input.decision === 'uphold' ? 'upheld' : 'dismissed', resolutionNote: input.note, resolvedById: req.member!.id, resolvedAt: new Date() } });
      if (input.decision === 'uphold') {
        await tx.checkIn.update({ where: { id: ct.checkInId }, data: { status: 'invalidated' } });
        if (ct.checkIn.weekGoalId) await this.weeks.recompute(tx, ct.checkIn.weekGoalId, req.user!.id, 'contestação aceita');
      }
    });
    const verdict = input.decision === 'uphold' ? 'aceitou a contestação — o registro não conta mais' : 'manteve o registro';
    await this.notify.feed(g.id, 'contest_resolved', `${verdict} (${ct.checkIn.member.user.name}, ${ct.checkIn.goal.emoji} ${ct.checkIn.goal.name})`, req.member!.id, ct.checkInId);
    await this.notify.users([ct.checkIn.member.userId], { groupId: g.id, type: 'contest', title: input.decision === 'uphold' ? 'Um registro seu foi invalidado' : 'Seu registro foi mantido 👍', body: input.note, link: `/g/${g.id}/feed` });
    return { ok: true };
  }

  private otherAdmins(groupId: string, exceptMemberId: string) {
    return this.prisma.member.count({ where: { groupId, role: { in: ['owner', 'admin'] }, status: { in: ['active', 'leaving'] }, id: { not: exceptMemberId } } });
  }

  // ---------------------------------------------------------------- uploads (photos, receipts)
  @Post('uploads')
  async upload(@Req() req: AuthedRequest) {
    const buf = req.body as unknown;
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw new DomainBadRequest('validation_error', 'Envie uma imagem');
    if (buf.length > MAX_UPLOAD) throw new DomainBadRequest('payload_too_large', 'Imagem muito grande (máx. 5 MB)');
    const kind = this.storage.sniff(buf);
    if (!kind) throw new DomainBadRequest('validation_error', 'Formato não suportado (use JPG, PNG ou WebP)');
    const row = await this.prisma.upload.create({ data: { groupId: req.group!.id, uploadedBy: req.user!.id, mime: kind.mime, size: buf.length, path: '' } });
    const path = await this.storage.save(req.group!.id, row.id, kind.ext, buf);
    await this.prisma.upload.update({ where: { id: row.id }, data: { path } });
    return { id: row.id };
  }

  @Get('uploads/:uploadId')
  @Header('Cache-Control', 'private, max-age=86400')
  async file(@Req() req: AuthedRequest, @Param('uploadId') id: string, @Res() res: Response) {
    const up = await this.prisma.upload.findFirst({ where: { id, groupId: req.group!.id } });
    if (!up || !up.path) throw new DomainNotFound('not_found', 'Arquivo não encontrado');
    const buf = await this.storage.read(up.path);
    res.setHeader('Content-Type', up.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(buf);
  }
}
