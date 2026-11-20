import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, type Group } from '@prisma/client';
import { addDays, formatCents, localDate, slotsAchieved, weekStartOf, weekWindow, weekDates, isoWeekday, type GoalSpec } from '@tenace/rules';
import { EnvService } from '../../common/env.service';
import { NotifyService } from '../../common/notify.service';
import { PrismaService } from '../../common/prisma.service';
import { fromDbDate, shortDate, toDbDate } from '../../common/request';

type Tx = Prisma.TransactionClient;
const TICK_MS = 60_000;
const LOCK_KEY = 7_141_300; // pg advisory lock for the scheduler tick

/**
 * The weekly engine (docs/spec.md §8.3): opens weeks (snapshots + COMMITMENT),
 * recomputes slots on every check-in change, and closes weeks (penalties to the fund).
 * Every operation is idempotent.
 */
@Injectable()
export class WeeksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Weeks');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly envs: EnvService,
  ) {}

  onModuleInit(): void {
    if (this.envs.env.SCHEDULER === 'off') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    setTimeout(() => void this.tick(), 3_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  currentWeekStart(group: Pick<Group, 'timezone'>, now = new Date()): string {
    return weekStartOf(localDate(now, group.timezone));
  }

  /** Monday when a member joining now starts being charged. */
  joinStartWeek(group: Pick<Group, 'timezone' | 'startsOn'>, now = new Date()): string {
    const next = addDays(this.currentWeekStart(group, now), 7);
    const startsOn = fromDbDate(group.startsOn);
    return startsOn > next ? startsOn : next;
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`;
      if (!rows[0]?.locked) return;
      try {
        const groups = await this.prisma.group.findMany({ where: { archivedAt: null } });
        for (const g of groups) await this.ensureCurrentWeek(g, now).catch((e) => this.logger.error(`open ${g.id}: ${(e as Error).message}`));
        const due = await this.prisma.week.findMany({ where: { status: 'open', closesAt: { lte: now } }, select: { id: true } });
        for (const w of due) await this.closeWeek(w.id, now).catch((e) => this.logger.error(`close ${w.id}: ${(e as Error).message}`));
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
      }
    } catch (e) {
      this.logger.error(`tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Opens the current week for a group when it is due. Returns the week id or null (not started). */
  async ensureCurrentWeek(group: Group, now = new Date()): Promise<string | null> {
    const ws = this.currentWeekStart(group, now);
    if (fromDbDate(group.startsOn) > ws) return null;
    const existing = await this.prisma.week.findUnique({ where: { groupId_weekStart: { groupId: group.id, weekStart: toDbDate(ws) } }, select: { id: true } });
    if (existing) return existing.id;
    return this.openWeek(group.id, ws, now);
  }

  async openWeek(groupId: string, weekStart: string, now = new Date()): Promise<string> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const group = await tx.group.findUniqueOrThrow({ where: { id: groupId } });
        const win = weekWindow(weekStart, group.timezone, group.closeGraceHours);
        const week = await tx.week.create({ data: { groupId, weekStart: toDbDate(weekStart), closesAt: win.closesAt, openedAt: now } });
        const goals = await tx.goal.findMany({ where: { groupId, archivedAt: null }, orderBy: { createdAt: 'asc' } });
        const members = await tx.member.findMany({
          where: {
            groupId,
            status: { in: ['active', 'leaving'] },
            startsOnWeek: { lte: toDbDate(weekStart) },
            OR: [{ endsAfterWeek: null }, { endsAfterWeek: { gte: toDbDate(weekStart) } }],
          },
        });
        // First week of a group started mid-week: daily goals only count from the creation day on.
        const createdLocal = localDate(group.createdAt, group.timezone);
        const partialFrom = fromDbDate(group.startsOn) === weekStart && createdLocal > weekStart ? createdLocal : null;
        const label = `${shortDate(weekStart)}–${shortDate(win.weekEnd)}`;

        for (const m of members) {
          const snaps = goals
            .filter((g) => !g.excludedMemberIds.includes(m.id))
            .map((g) => {
              let activeWeekdays = g.activeWeekdays;
              let slotsPerWeek = g.slotsPerWeek;
              if (g.period === 'daily' && partialFrom) {
                const allowed = new Set(weekDates(weekStart).filter((d) => d >= partialFrom).map(isoWeekday));
                activeWeekdays = activeWeekdays.filter((d) => allowed.has(d));
                slotsPerWeek = activeWeekdays.length;
              }
              return { g, activeWeekdays, slotsPerWeek };
            })
            .filter((s) => s.slotsPerWeek > 0);
          const commitment = snaps.reduce((s, x) => s + x.slotsPerWeek * x.g.stakeCents, 0);
          const mw = await tx.memberWeek.create({ data: { weekId: week.id, memberId: m.id, commitmentCents: commitment } });
          for (const s of snaps) {
            await tx.weekGoal.create({
              data: {
                memberWeekId: mw.id,
                goalId: s.g.id,
                name: s.g.name,
                emoji: s.g.emoji,
                period: s.g.period,
                target: s.g.target,
                unit: s.g.unit,
                slotsPerWeek: s.slotsPerWeek,
                stakeCents: s.g.stakeCents,
                activeWeekdays: s.activeWeekdays,
              },
            });
          }
          if (commitment > 0) {
            await tx.ledgerEntry.create({ data: { groupId, memberId: m.id, type: 'COMMITMENT', amountCents: -commitment, weekId: week.id, description: `Compromisso da semana ${label}` } });
          }
        }
        // Check-ins registered before the week opened (scheduler lag) are attached now.
        const early = await tx.checkIn.findMany({ where: { groupId, status: 'valid', weekId: null, date: { gte: toDbDate(weekStart), lte: toDbDate(win.weekEnd) } } });
        for (const c of early) await this.attachCheckIn(tx, c.id, week.id);
        return week.id;
      }, { timeout: 30_000 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const w = await this.prisma.week.findUniqueOrThrow({ where: { groupId_weekStart: { groupId, weekStart: toDbDate(weekStart) } } });
        return w.id;
      }
      throw e;
    }
  }

  /** Links a check-in to its week snapshot (if the member is charged for that goal) and recomputes. */
  async attachCheckIn(tx: Tx, checkInId: string, weekId: string): Promise<{ weekGoalId: string | null; delta: number }> {
    const c = await tx.checkIn.findUniqueOrThrow({ where: { id: checkInId } });
    const wg = await tx.weekGoal.findFirst({ where: { goalId: c.goalId, memberWeek: { weekId, memberId: c.memberId } }, select: { id: true } });
    await tx.checkIn.update({ where: { id: c.id }, data: { weekId, weekGoalId: wg?.id ?? null } });
    if (!wg) return { weekGoalId: null, delta: 0 };
    return { weekGoalId: wg.id, delta: await this.recompute(tx, wg.id, null) };
  }

  /**
   * Recomputes the slots of one week-goal from its valid check-ins and posts the difference
   * as SLOT_CREDIT / SLOT_REVERSAL. After close, it also corrects the fund receivable.
   */
  async recompute(tx: Tx, weekGoalId: string, actorUserId: string | null, reason?: string): Promise<number> {
    await tx.$queryRaw`SELECT id FROM week_goals WHERE id = ${weekGoalId} FOR UPDATE`;
    const wg = await tx.weekGoal.findUniqueOrThrow({ where: { id: weekGoalId }, include: { memberWeek: { include: { week: true, member: { include: { user: true } } } } } });
    const checkIns = await tx.checkIn.findMany({ where: { weekGoalId, status: 'valid' }, select: { date: true, quantity: true } });
    const spec: GoalSpec = { period: wg.period, target: wg.target, unit: wg.unit, slotsPerWeek: wg.slotsPerWeek, stakeCents: wg.stakeCents, activeWeekdays: wg.activeWeekdays };
    const achieved = slotsAchieved(
      spec,
      checkIns.map((c) => ({ date: fromDbDate(c.date), quantity: c.quantity })),
    );
    const delta = achieved * wg.stakeCents - wg.creditedCents;
    if (delta === 0) {
      if (achieved !== wg.slotsAchieved) await tx.weekGoal.update({ where: { id: wg.id }, data: { slotsAchieved: achieved } });
      return 0;
    }
    const mw = wg.memberWeek;
    const week = mw.week;
    await tx.weekGoal.update({ where: { id: wg.id }, data: { slotsAchieved: achieved, creditedCents: { increment: delta } } });
    const closed = week.status === 'closed';
    const newPenalty = closed ? (mw.penaltyCents ?? 0) - delta : null;
    await tx.memberWeek.update({
      where: { id: mw.id },
      data: { creditedCents: { increment: delta }, ...(closed ? { penaltyCents: newPenalty, allMet: newPenalty === 0 } : {}) },
    });
    const slots = Math.abs(delta / wg.stakeCents);
    const what = `${slots} ${slots === 1 ? 'cota' : 'cotas'} · ${wg.emoji} ${wg.name}`;
    await tx.ledgerEntry.create({
      data: {
        groupId: week.groupId,
        memberId: mw.memberId,
        type: delta > 0 ? 'SLOT_CREDIT' : 'SLOT_REVERSAL',
        amountCents: delta,
        weekId: week.id,
        weekGoalId: wg.id,
        description: delta > 0 ? `Cumpriu ${what}` : `Estorno de ${what}${reason ? ` (${reason})` : ''}`,
        createdById: actorUserId,
      },
    });
    if (closed) {
      await tx.fundEntry.create({
        data: {
          groupId: week.groupId,
          type: 'PENALTY_ADJUSTED',
          receivableDeltaCents: -delta,
          memberId: mw.memberId,
          weekId: week.id,
          description: `Ajuste da multa de ${mw.member.user.name} (semana ${shortDate(fromDbDate(week.weekStart))})${reason ? ` — ${reason}` : ''}`,
          createdById: actorUserId,
        },
      });
    }
    return delta;
  }

  async closeWeek(weekId: string, now = new Date()): Promise<void> {
    const results = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM weeks WHERE id = ${weekId} FOR UPDATE`;
      const week = await tx.week.findUniqueOrThrow({ where: { id: weekId }, include: { group: true, memberWeeks: { include: { member: { include: { user: true } } } } } });
      if (week.status === 'closed') return null;
      const ws = fromDbDate(week.weekStart);
      const out: { userId: string; name: string; penalty: number; commitment: number }[] = [];
      for (const mw of week.memberWeeks) {
        const penalty = Math.max(0, mw.commitmentCents - mw.creditedCents);
        await tx.memberWeek.update({ where: { id: mw.id }, data: { penaltyCents: penalty, allMet: penalty === 0 } });
        if (penalty > 0) {
          await tx.fundEntry.create({
            data: { groupId: week.groupId, type: 'PENALTY_ASSESSED', receivableDeltaCents: penalty, memberId: mw.memberId, weekId, description: `Multa da semana ${shortDate(ws)} — ${mw.member.user.name}` },
          });
        }
        if (mw.commitmentCents > 0) await tx.member.update({ where: { id: mw.memberId }, data: { streak: penalty === 0 ? { increment: 1 } : 0 } });
        out.push({ userId: mw.member.userId, name: mw.member.user.name, penalty, commitment: mw.commitmentCents });
      }
      await tx.week.update({ where: { id: weekId }, data: { status: 'closed', closedAt: now } });
      await tx.member.updateMany({ where: { groupId: week.groupId, status: 'leaving', endsAfterWeek: { lte: week.weekStart } }, data: { status: 'left' } });
      return { group: week.group, ws, out };
    }, { timeout: 30_000 });
    if (!results) return;
    const { group, ws, out } = results;
    const met = out.filter((o) => o.commitment > 0 && o.penalty === 0).length;
    const total = out.filter((o) => o.commitment > 0).length;
    const sum = out.reduce((s, o) => s + o.penalty, 0);
    await this.notify.feed(group.id, 'week_closed', `Semana ${shortDate(ws)} fechada: ${met} de ${total} ${total === 1 ? 'pessoa cumpriu' : 'cumpriram'} tudo${sum > 0 ? ` · ${formatCents(sum)} para o caixa` : ' 🎉'}`);
    for (const o of out.filter((x) => x.commitment > 0)) {
      await this.notify.users([o.userId], {
        groupId: group.id,
        type: 'week_closed',
        title: o.penalty === 0 ? `${group.emoji} Semana fechada no zero! 🎉` : `${group.emoji} Semana fechada: ${formatCents(o.penalty)} de multa`,
        body: o.penalty === 0 ? `Você cumpriu todas as metas em ${group.name}. Non arrenderti!` : `Faltou pouco em ${group.name}. O valor vai para ${group.destLabel}.`,
        link: `/g/${group.id}/conta`,
      });
    }
  }
}
