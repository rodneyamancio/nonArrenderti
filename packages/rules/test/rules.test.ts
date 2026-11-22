import { describe, expect, it } from 'vitest';
import {
  addDays,
  checkInWindow,
  commitmentCents,
  crc16,
  describeGoal,
  formatCents,
  goalProblem,
  goalProgress,
  isoWeekday,
  localDate,
  normalizeGoal,
  parseMoneyToCents,
  pixPayload,
  slotsAchieved,
  startOfLocalDay,
  weekStartOf,
  weekWindow,
  type GoalSpec,
  billingState,
  canAddMember,
  canOwnAnotherGroup,
  planFitProblem,
  planPriceLabel,
} from '../src';

const SP = 'America/Sao_Paulo';
const gym: GoalSpec = normalizeGoal({ period: 'weekly', target: 3, unit: 'times', stakeCents: 500, activeWeekdays: [] });
const bookWeekly: GoalSpec = normalizeGoal({ period: 'weekly', target: 30, unit: 'páginas', slotsPerWeek: 3, stakeCents: 500, activeWeekdays: [] });
const bookDaily: GoalSpec = normalizeGoal({ period: 'daily', target: 10, unit: 'páginas', stakeCents: 200, activeWeekdays: [1, 2, 3, 4, 5, 6, 7] });
const ws = '2026-11-16'; // a Monday

describe('dates', () => {
  it('computes ISO weekdays and week starts', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-22')).toBe(7);
    expect(weekStartOf('2026-11-22')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-16')).toBe('2026-11-16');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('finds the start of a local day across time zones', () => {
    expect(startOfLocalDay('2026-11-16', SP).toISOString()).toBe('2026-11-16T03:00:00.000Z');
    expect(startOfLocalDay('2026-11-16', 'UTC').toISOString()).toBe('2026-11-16T00:00:00.000Z');
    // New York DST ends on 2026-11-01: midnight is still EDT (−4)
    expect(startOfLocalDay('2026-11-01', 'America/New_York').toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(startOfLocalDay('2026-11-02', 'America/New_York').toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('local date respects the zone', () => {
    const late = new Date('2026-11-23T02:30:00Z'); // Sunday 23:30 in São Paulo
    expect(localDate(late, SP)).toBe('2026-11-22');
    expect(localDate(late, 'UTC')).toBe('2026-11-23');
  });

  it('week window closes after the grace period', () => {
    const w = weekWindow(ws, SP, 12);
    expect(w.endsAt.toISOString()).toBe('2026-11-23T03:00:00.000Z');
    expect(w.closesAt.toISOString()).toBe('2026-11-23T15:00:00.000Z');
  });

  it('check-in window: current week, previous week in grace, never future', () => {
    const mondayMorning = new Date('2026-11-23T12:00:00Z'); // Monday 09:00 SP
    expect(checkInWindow('2026-11-22', mondayMorning, SP, 12)).toEqual({ ok: true, weekStart: '2026-11-16' });
    expect(checkInWindow('2026-11-23', mondayMorning, SP, 12)).toEqual({ ok: true, weekStart: '2026-11-23' });
    expect(checkInWindow('2026-11-24', mondayMorning, SP, 12)).toEqual({ ok: false, reason: 'future' });
    const mondayAfternoon = new Date('2026-11-23T16:00:00Z'); // 13:00 SP, grace over
    expect(checkInWindow('2026-11-22', mondayAfternoon, SP, 12)).toEqual({ ok: false, reason: 'too_old' });
    expect(checkInWindow('2026-11-09', mondayMorning, SP, 12)).toEqual({ ok: false, reason: 'too_old' });
  });
});

describe('goals and slots', () => {
  it('normalizes slots per goal kind', () => {
    expect(gym.slotsPerWeek).toBe(3);
    expect(bookWeekly.slotsPerWeek).toBe(3);
    expect(bookDaily.slotsPerWeek).toBe(7);
    expect(normalizeGoal({ ...bookDaily, activeWeekdays: [1, 2, 3, 4, 5, 5, 9] }).slotsPerWeek).toBe(5);
    expect(normalizeGoal({ period: 'weekly', target: 2, unit: 'km', slotsPerWeek: 10, stakeCents: 1, activeWeekdays: [] }).slotsPerWeek).toBe(2);
  });

  it("matches the user's example: gym 3× + book 3× at R$5 → −R$30, two misses → −R$5", () => {
    const bookTimes = normalizeGoal({ period: 'weekly', target: 3, unit: 'times', stakeCents: 500, activeWeekdays: [] });
    expect(commitmentCents([gym, bookTimes])).toBe(3000);
    const gymDone = slotsAchieved(gym, [1, 2, 3].map((i) => ({ date: addDays(ws, i), quantity: 1 })));
    const bookDone = slotsAchieved(bookTimes, [1, 2].map((i) => ({ date: addDays(ws, i), quantity: 1 })));
    expect(gymDone * 500 + bookDone * 500 - 3000).toBe(-500);
  });

  it('weekly frequency never exceeds the target', () => {
    expect(slotsAchieved(gym, Array.from({ length: 6 }, () => ({ date: ws, quantity: 1 })))).toBe(3);
  });

  it('weekly quantity pays each threshold cumulatively', () => {
    expect(slotsAchieved(bookWeekly, [{ date: ws, quantity: 9 }])).toBe(0);
    expect(slotsAchieved(bookWeekly, [{ date: ws, quantity: 10 }])).toBe(1);
    expect(slotsAchieved(bookWeekly, [{ date: ws, quantity: 12 }, { date: addDays(ws, 1), quantity: 13 }])).toBe(2);
    expect(slotsAchieved(bookWeekly, [{ date: ws, quantity: 100 }])).toBe(3);
  });

  it('daily goal pays a day only when the day reaches the target', () => {
    const checkIns = [
      { date: ws, quantity: 6 },
      { date: ws, quantity: 4 }, // Monday: 10 ✔
      { date: addDays(ws, 1), quantity: 9 }, // Tuesday: 9 ✘
      { date: addDays(ws, 2), quantity: 30 }, // Wednesday ✔ (no extra)
    ];
    expect(slotsAchieved(bookDaily, checkIns)).toBe(2);
    const weekdaysOnly = normalizeGoal({ ...bookDaily, activeWeekdays: [1, 2, 3, 4, 5] });
    expect(slotsAchieved(weekdaysOnly, [{ date: addDays(ws, 5), quantity: 10 }])).toBe(0); // Saturday is not due
  });

  it('progress tells what is missing for the next slot', () => {
    const p = goalProgress(bookWeekly, [{ date: ws, quantity: 12 }]);
    expect(p).toMatchObject({ achieved: 1, toNext: 8, creditedCents: 500, commitmentCents: 1500 });
    const d = goalProgress(bookDaily, [{ date: ws, quantity: 4 }], ws);
    expect(d.toNext).toBe(6);
    expect(goalProgress(gym, [1, 2, 3].map(() => ({ date: ws, quantity: 1 }))).toNext).toBeNull();
  });

  it('validates goals', () => {
    expect(goalProblem(gym)).toBeNull();
    expect(goalProblem({ ...gym, stakeCents: 0 })).not.toBeNull();
    expect(goalProblem({ ...bookDaily, activeWeekdays: [], slotsPerWeek: 0 })).not.toBeNull();
  });

  it('describes goals in Portuguese', () => {
    expect(describeGoal(gym)).toBe('3× por semana');
    expect(describeGoal(bookWeekly)).toBe('30 páginas por semana em 3 cotas');
    expect(describeGoal(normalizeGoal({ ...bookDaily, activeWeekdays: [1, 2, 3, 4, 5] }))).toBe('10 páginas por dia (seg–sex)');
  });
});

describe('money and PIX', () => {
  it('formats and parses BRL', () => {
    expect(formatCents(123456)).toBe('R$ 1.234,56');
    expect(formatCents(-500)).toBe('-R$ 5,00');
    expect(parseMoneyToCents('5')).toBe(500);
    expect(parseMoneyToCents('12,5')).toBe(1250);
    expect(parseMoneyToCents('1.234,56')).toBe(123456);
    expect(parseMoneyToCents('abc')).toBeNull();
  });

  it('CRC16-CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('builds a valid static BR Code', () => {
    const p = pixPayload({ keyType: 'email', key: 'Caixa@Example.com', name: 'João da Silva', city: 'São Paulo', amountCents: 1050 });
    expect(p.startsWith('000201')).toBe(true);
    expect(p).toContain('0014br.gov.bcb.pix0117caixa@example.com');
    expect(p).toContain('540510.50');
    expect(p).toContain('5913JOAO DA SILVA');
    expect(p).toContain('6009SAO PAULO');
    expect(p).toContain('62070503***');
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });
});

describe('billing', () => {
  const inv = (dueDate: string, status: 'open' | 'paid' | 'void' = 'open') => ({ dueDate, status });
  it('is ok with nothing open and due until the due date', () => {
    expect(billingState([inv('2026-11-10', 'paid')], '2026-11-20').status).toBe('ok');
    expect(billingState([inv('2026-11-10')], '2026-11-10')).toMatchObject({ status: 'due', oldestDue: '2026-11-10' });
  });
  it('gives 5 days of grace, then blocks on the 6th day after the due date', () => {
    expect(billingState([inv('2026-11-10')], '2026-11-11')).toMatchObject({ status: 'past_due', daysToBlock: 5, lastGraceDay: '2026-11-15' });
    expect(billingState([inv('2026-11-10')], '2026-11-15')).toMatchObject({ status: 'past_due', daysToBlock: 1 });
    expect(billingState([inv('2026-11-10')], '2026-11-16')).toMatchObject({ status: 'blocked', daysToBlock: 0 });
  });
  it('looks at the oldest open invoice and ignores void ones', () => {
    expect(billingState([inv('2026-12-10'), inv('2026-11-10')], '2026-11-20').status).toBe('blocked');
    expect(billingState([inv('2026-10-10', 'void'), inv('2026-11-30')], '2026-11-20').status).toBe('due');
  });
  it('checks plan limits (null = unlimited)', () => {
    expect(canOwnAnotherGroup(null, 99)).toBe(true);
    expect(canOwnAnotherGroup({ maxGroups: 1, maxMembersPerGroup: null }, 1)).toBe(false);
    expect(canAddMember({ maxGroups: null, maxMembersPerGroup: 5 }, 4)).toBe(true);
    expect(canAddMember({ maxGroups: null, maxMembersPerGroup: 5 }, 5)).toBe(false);
    expect(planFitProblem({ name: 'Grátis', maxGroups: 1, maxMembersPerGroup: 5 }, { groups: 2, largestGroup: 3 })).toMatch(/2 grupos/);
    expect(planFitProblem({ name: 'Grátis', maxGroups: 1, maxMembersPerGroup: 5 }, { groups: 1, largestGroup: 6 })).toMatch(/6 pessoas/);
    expect(planFitProblem({ name: 'Pro', maxGroups: null, maxMembersPerGroup: null }, { groups: 9, largestGroup: 40 })).toBeNull();
    expect(planPriceLabel(1990, 1, (c) => `R$ ${c / 100}`)).toBe('R$ 19.9/mês');
    expect(planPriceLabel(0, 1, String)).toBe('Grátis');
  });
});
