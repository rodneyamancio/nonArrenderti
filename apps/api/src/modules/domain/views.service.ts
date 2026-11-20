import { Injectable } from '@nestjs/common';
import type { Group, Prisma, WeekGoal } from '@prisma/client';
import { goalProgress, localDate, weekWindow } from '@tenace/rules';
import type {
  AccountView,
  CheckInView,
  ContestView,
  Destination,
  FundView,
  GoalView,
  LedgerEntryView,
  PixKeyType,
  WeekGoalView,
  WeekInfo,
} from '@tenace/types';
import { PrismaService } from '../../common/prisma.service';
import { fromDbDate, iso, toDbDate } from '../../common/request';

export const checkInInclude = {
  member: { include: { user: { select: { name: true, avatarColor: true } } } },
  goal: { select: { name: true, emoji: true, unit: true } },
  reactions: { select: { emoji: true, memberId: true } },
  contests: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CheckInInclude;
type CheckInFull = Prisma.CheckInGetPayload<{ include: typeof checkInInclude }>;

/** Builds API views (pure reads). */
@Injectable()
export class ViewsService {
  constructor(private readonly prisma: PrismaService) {}

  destination(g: Group): Destination {
    return { label: g.destLabel, holderName: g.destHolderName, pixKeyType: (g.destPixKeyType as PixKeyType | null) ?? null, pixKey: g.destPixKey, bankInfo: g.destBankInfo, city: g.destCity };
  }

  weekInfo(group: Group, weekStart: string, week: { id: string; status: 'open' | 'closed' } | null): WeekInfo {
    const w = weekWindow(weekStart, group.timezone, group.closeGraceHours);
    return { id: week?.id ?? null, weekStart, weekEnd: w.weekEnd, endsAt: w.endsAt.toISOString(), closesAt: w.closesAt.toISOString(), status: week?.status ?? 'not_started' };
  }

  goal(g: { id: string; name: string; emoji: string; period: 'daily' | 'weekly'; target: number; unit: string; slotsPerWeek: number; stakeCents: number; activeWeekdays: number[]; excludedMemberIds: string[]; archivedAt: Date | null; createdAt: Date }): GoalView {
    return { ...g, archivedAt: iso(g.archivedAt), createdAt: g.createdAt.toISOString() };
  }

  /** Week-goal snapshot + its valid check-ins → progress view. */
  weekGoal(wg: WeekGoal, checkIns: { date: Date; quantity: number }[], today: string): WeekGoalView {
    const list = checkIns.map((c) => ({ date: fromDbDate(c.date), quantity: c.quantity }));
    const p = goalProgress(wg, list, today);
    const byDate: Record<string, number> = {};
    for (const c of list) byDate[c.date] = (byDate[c.date] ?? 0) + c.quantity;
    return {
      id: wg.id,
      goalId: wg.goalId,
      name: wg.name,
      emoji: wg.emoji,
      period: wg.period,
      target: wg.target,
      unit: wg.unit,
      slotsPerWeek: wg.slotsPerWeek,
      stakeCents: wg.stakeCents,
      activeWeekdays: wg.activeWeekdays,
      slotsAchieved: wg.slotsAchieved,
      creditedCents: wg.creditedCents,
      totalQuantity: p.totalQuantity,
      toNext: p.toNext,
      byDate,
    };
  }

  /** All week-goals of a member-week with progress. */
  async memberWeekGoals(memberWeekId: string, today: string): Promise<WeekGoalView[]> {
    const wgs = await this.prisma.weekGoal.findMany({ where: { memberWeekId }, include: { checkIns: { where: { status: 'valid' }, select: { date: true, quantity: true } } }, orderBy: { name: 'asc' } });
    return wgs.map((wg) => this.weekGoal(wg, wg.checkIns, today));
  }

  async weekGoalView(weekGoalId: string, today: string): Promise<WeekGoalView> {
    const wg = await this.prisma.weekGoal.findUniqueOrThrow({ where: { id: weekGoalId }, include: { checkIns: { where: { status: 'valid' }, select: { date: true, quantity: true } } } });
    return this.weekGoal(wg, wg.checkIns, today);
  }

  today(group: Group, now = new Date()): string {
    return localDate(now, group.timezone);
  }

  async checkIns(ids: string[], viewerMemberId: string): Promise<Map<string, CheckInView>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.checkIn.findMany({ where: { id: { in: ids } }, include: checkInInclude });
    const nameIds = new Set<string>();
    for (const r of rows) for (const c of r.contests) [c.openedByMemberId, c.resolvedById].forEach((x) => x && nameIds.add(x));
    const names = await this.memberNames([...nameIds]);
    return new Map(rows.map((r) => [r.id, this.checkIn(r, viewerMemberId, names)]));
  }

  checkIn(r: CheckInFull, viewerMemberId: string, names: Map<string, string>): CheckInView {
    const reactions = new Map<string, { count: number; mine: boolean }>();
    for (const x of r.reactions) {
      const cur = reactions.get(x.emoji) ?? { count: 0, mine: false };
      reactions.set(x.emoji, { count: cur.count + 1, mine: cur.mine || x.memberId === viewerMemberId });
    }
    return {
      id: r.id,
      memberId: r.memberId,
      memberName: r.member.user.name,
      avatarColor: r.member.user.avatarColor,
      goalId: r.goalId,
      goalName: r.goal.name,
      goalEmoji: r.goal.emoji,
      unit: r.goal.unit,
      date: fromDbDate(r.date),
      quantity: r.quantity,
      note: r.note,
      photoUploadId: r.photoUploadId,
      status: r.status,
      counted: r.status === 'valid' && !!r.weekGoalId,
      createdAt: r.createdAt.toISOString(),
      reactions: [...reactions].map(([emoji, v]) => ({ emoji, ...v })),
      contests: r.contests.map(
        (c): ContestView => ({
          id: c.id,
          openedByName: names.get(c.openedByMemberId) ?? 'Alguém',
          reason: c.reason,
          status: c.status,
          resolutionNote: c.resolutionNote,
          resolvedByName: c.resolvedById ? (names.get(c.resolvedById) ?? null) : null,
          createdAt: c.createdAt.toISOString(),
        }),
      ),
    };
  }

  /** memberId (or userId for resolvers stored as member ids) → display name. */
  async memberNames(memberIds: string[]): Promise<Map<string, string>> {
    if (!memberIds.length) return new Map();
    const ms = await this.prisma.member.findMany({ where: { id: { in: memberIds } }, include: { user: { select: { name: true } } } });
    return new Map(ms.map((m) => [m.id, m.user.name]));
  }

  async openWeekIds(groupId: string): Promise<string[]> {
    return (await this.prisma.week.findMany({ where: { groupId, status: 'open' }, select: { id: true } })).map((w) => w.id);
  }

  /** Member balances split into "week in progress" and "open debt". */
  async balances(groupId: string): Promise<Map<string, { balance: number; week: number }>> {
    const openIds = await this.openWeekIds(groupId);
    const [all, week] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({ by: ['memberId'], where: { groupId }, _sum: { amountCents: true } }),
      openIds.length ? this.prisma.ledgerEntry.groupBy({ by: ['memberId'], where: { groupId, weekId: { in: openIds } }, _sum: { amountCents: true } }) : Promise.resolve([]),
    ]);
    const out = new Map<string, { balance: number; week: number }>();
    for (const a of all) out.set(a.memberId, { balance: a._sum.amountCents ?? 0, week: 0 });
    for (const w of week) out.set(w.memberId, { balance: out.get(w.memberId)?.balance ?? 0, week: w._sum.amountCents ?? 0 });
    return out;
  }

  async account(groupId: string, memberId: string): Promise<AccountView> {
    const member = await this.prisma.member.findFirstOrThrow({ where: { id: memberId, groupId }, include: { user: true } });
    const openIds = new Set(await this.openWeekIds(groupId));
    const rows = await this.prisma.ledgerEntry.findMany({ where: { groupId, memberId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const weekStarts = new Map((await this.prisma.week.findMany({ where: { groupId }, select: { id: true, weekStart: true } })).map((w) => [w.id, fromDbDate(w.weekStart)]));
    let running = 0;
    let weekCents = 0;
    const entries: LedgerEntryView[] = rows.map((r) => {
      running += r.amountCents;
      if (r.weekId && openIds.has(r.weekId)) weekCents += r.amountCents;
      return { id: r.id, type: r.type, amountCents: r.amountCents, description: r.description, weekStart: r.weekId ? (weekStarts.get(r.weekId) ?? null) : null, createdAt: r.createdAt.toISOString(), balanceAfterCents: running };
    });
    const pending = await this.prisma.payment.aggregate({ where: { groupId, memberId, status: 'pending' }, _sum: { amountCents: true } });
    return {
      member: { id: member.id, name: member.user.name, avatarColor: member.user.avatarColor },
      balanceCents: running,
      weekCents,
      openDebtCents: -(running - weekCents),
      pendingPaymentCents: pending._sum.amountCents ?? 0,
      entries: entries.reverse(),
    };
  }

  async fund(groupId: string): Promise<FundView> {
    const [entries, sums, members, balances] = await Promise.all([
      this.prisma.fundEntry.findMany({ where: { groupId }, orderBy: { createdAt: 'desc' }, take: 300 }),
      this.prisma.fundEntry.groupBy({ by: ['type'], where: { groupId }, _sum: { receivableDeltaCents: true, cashDeltaCents: true } }),
      this.prisma.member.findMany({ where: { groupId }, include: { user: { select: { id: true, name: true, avatarColor: true } } } }),
      this.balances(groupId),
    ]);
    const byMember = new Map(members.map((m) => [m.id, m]));
    const byUser = new Map(members.map((m) => [m.userId, m.user.name]));
    let receivable = 0;
    let cash = 0;
    let collected = 0;
    let spent = 0;
    for (const s of sums) {
      receivable += s._sum.receivableDeltaCents ?? 0;
      cash += s._sum.cashDeltaCents ?? 0;
      if (s.type === 'PAYMENT_RECEIVED') collected += s._sum.cashDeltaCents ?? 0;
      if (s.type === 'EXPENSE') spent -= s._sum.cashDeltaCents ?? 0;
    }
    const debtors = [...balances]
      .map(([memberId, b]) => ({ memberId, openDebtCents: -(b.balance - b.week) }))
      .filter((d) => d.openDebtCents > 0)
      .map((d) => ({ ...d, name: byMember.get(d.memberId)?.user.name ?? '—', avatarColor: byMember.get(d.memberId)?.user.avatarColor ?? 'violet' }))
      .sort((a, b) => b.openDebtCents - a.openDebtCents);
    return {
      receivableCents: receivable,
      cashCents: cash,
      totalCollectedCents: collected,
      totalSpentCents: spent,
      debtors,
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        receivableDeltaCents: e.receivableDeltaCents,
        cashDeltaCents: e.cashDeltaCents,
        description: e.description,
        memberName: e.memberId ? (byMember.get(e.memberId)?.user.name ?? null) : null,
        receiptUploadId: e.receiptUploadId,
        createdAt: e.createdAt.toISOString(),
        createdByName: e.createdById ? (byUser.get(e.createdById) ?? null) : null,
      })),
    };
  }

  dbDate = toDbDate;
}
