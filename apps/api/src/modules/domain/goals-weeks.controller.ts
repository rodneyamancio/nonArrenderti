import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { addDays, describeGoal, formatCents, isLocalDate, weekStartOf } from '@tenace/rules';
import type { GoalView, MemberWeekView, WeekBoard, WeekHistoryItem } from '@tenace/types';
import { DomainNotFound } from '../../common/errors/domain-exceptions';
import { NotifyService } from '../../common/notify.service';
import { PrismaService } from '../../common/prisma.service';
import { fromDbDate, toDbDate, type AuthedRequest } from '../../common/request';
import { parseBody } from '../../common/validation';
import { GroupGuard, NeedGroup } from './group.guard';
import { goalSchema } from './schemas';
import { ViewsService } from './views.service';
import { WeeksService } from './weeks.service';

@Controller('groups/:groupId')
@UseGuards(GroupGuard)
export class GoalsWeeksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ViewsService,
    private readonly weeks: WeeksService,
    private readonly notify: NotifyService,
  ) {}

  // ---------------------------------------------------------------- goals
  @Get('goals')
  async goals(@Req() req: AuthedRequest, @Query('archived') archived?: string): Promise<{ goals: GoalView[] }> {
    const rows = await this.prisma.goal.findMany({ where: { groupId: req.group!.id, ...(archived === 'true' ? {} : { archivedAt: null }) }, orderBy: { createdAt: 'asc' } });
    return { goals: rows.map((g) => this.views.goal(g)) };
  }

  @Post('goals')
  @NeedGroup('goal:goal:manage')
  async createGoal(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parseBody(goalSchema, body);
    const g = await this.prisma.goal.create({ data: { ...input, groupId: req.group!.id } });
    await this.notify.feed(req.group!.id, 'goal_changed', `Nova meta: ${g.emoji} ${g.name} — ${describeGoal(g)}, ${formatCents(g.stakeCents)} por cota (vale a partir da próxima semana)`, req.member!.id);
    return this.views.goal(g);
  }

  @Patch('goals/:goalId')
  @NeedGroup('goal:goal:manage')
  async updateGoal(@Req() req: AuthedRequest, @Param('goalId') goalId: string, @Body() body: unknown) {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, groupId: req.group!.id, archivedAt: null } });
    if (!goal) throw new DomainNotFound('not_found', 'Meta não encontrada');
    const input = parseBody(goalSchema, body);
    const g = await this.prisma.goal.update({ where: { id: goal.id }, data: input });
    await this.notify.feed(req.group!.id, 'goal_changed', `Meta atualizada: ${g.emoji} ${g.name} — ${describeGoal(g)}, ${formatCents(g.stakeCents)} por cota (vale a partir da próxima semana)`, req.member!.id);
    return this.views.goal(g);
  }

  @Delete('goals/:goalId')
  @NeedGroup('goal:goal:manage')
  async archiveGoal(@Req() req: AuthedRequest, @Param('goalId') goalId: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, groupId: req.group!.id, archivedAt: null } });
    if (!goal) throw new DomainNotFound('not_found', 'Meta não encontrada');
    await this.prisma.goal.update({ where: { id: goal.id }, data: { archivedAt: new Date() } });
    await this.notify.feed(req.group!.id, 'goal_changed', `Meta encerrada: ${goal.emoji} ${goal.name} (deixa de contar na próxima semana)`, req.member!.id);
    return { ok: true };
  }

  // ---------------------------------------------------------------- week board
  @Get('week')
  async board(@Req() req: AuthedRequest, @Query('start') start?: string): Promise<WeekBoard> {
    const g = req.group!;
    await this.weeks.ensureCurrentWeek(g);
    const current = this.weeks.currentWeekStart(g);
    const ws = start && isLocalDate(start) ? weekStartOf(start) : current;
    const today = this.views.today(g);
    const week = await this.prisma.week.findUnique({
      where: { groupId_weekStart: { groupId: g.id, weekStart: toDbDate(ws) } },
      include: { memberWeeks: { include: { member: { include: { user: { select: { name: true, avatarColor: true } } } } } } },
    });
    const members: MemberWeekView[] = [];
    const seen = new Set<string>();
    for (const mw of week?.memberWeeks ?? []) {
      seen.add(mw.memberId);
      members.push({
        memberId: mw.memberId,
        name: mw.member.user.name,
        avatarColor: mw.member.user.avatarColor,
        streak: mw.member.streak,
        charged: true,
        commitmentCents: mw.commitmentCents,
        creditedCents: mw.creditedCents,
        penaltyCents: mw.penaltyCents,
        goals: await this.views.memberWeekGoals(mw.id, today),
      });
    }
    if (ws === current) {
      const others = await this.prisma.member.findMany({ where: { groupId: g.id, status: { in: ['active', 'leaving'] }, id: { notIn: [...seen] } }, include: { user: true } });
      for (const m of others) members.push({ memberId: m.id, name: m.user.name, avatarColor: m.user.avatarColor, streak: m.streak, charged: false, commitmentCents: 0, creditedCents: 0, penaltyCents: null, goals: [] });
    }
    // Me first, then by progress.
    const me = req.member!.id;
    members.sort((a, b) => (a.memberId === me ? -1 : b.memberId === me ? 1 : ratio(b) - ratio(a) || a.name.localeCompare(b.name)));
    const first = await this.prisma.week.findFirst({ where: { groupId: g.id }, orderBy: { weekStart: 'asc' }, select: { weekStart: true } });
    const prev = addDays(ws, -7);
    return {
      week: this.views.weekInfo(g, ws, week),
      today,
      members,
      previousWeekStart: first && fromDbDate(first.weekStart) <= prev ? prev : null,
      nextWeekStart: ws < current ? addDays(ws, 7) : null,
    };
  }

  @Get('weeks')
  async history(@Req() req: AuthedRequest): Promise<{ weeks: WeekHistoryItem[] }> {
    const weeks = await this.prisma.week.findMany({
      where: { groupId: req.group!.id },
      orderBy: { weekStart: 'desc' },
      take: 26,
      include: { memberWeeks: { include: { member: { include: { user: { select: { name: true } } } } } } },
    });
    return {
      weeks: weeks.map((w) => ({
        weekStart: fromDbDate(w.weekStart),
        weekEnd: addDays(fromDbDate(w.weekStart), 6),
        status: w.status,
        members: w.memberWeeks.map((mw) => ({
          memberId: mw.memberId,
          name: mw.member.user.name,
          commitmentCents: mw.commitmentCents,
          creditedCents: mw.creditedCents,
          penaltyCents: mw.penaltyCents,
          allMet: mw.commitmentCents > 0 && mw.creditedCents >= mw.commitmentCents,
        })),
      })),
    };
  }
}

function ratio(m: MemberWeekView): number {
  return m.commitmentCents > 0 ? m.creditedCents / m.commitmentCents : -1;
}
