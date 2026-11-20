import { isoWeekday } from './dates';

export type GoalPeriod = 'daily' | 'weekly';
export const TIMES_UNIT = 'times';

export interface GoalSpec {
  period: GoalPeriod;
  /** Amount per period (daily: per day; weekly: per week). Integer ≥ 1. */
  target: number;
  /** "times" or a free label ("páginas", "km", "minutos"). */
  unit: string;
  /** Payable slots per week. Daily: number of active weekdays. Weekly "times": = target. */
  slotsPerWeek: number;
  stakeCents: number;
  /** ISO weekdays (1..7) a daily goal is due. Ignored for weekly goals. */
  activeWeekdays: number[];
}

export interface CheckInLike {
  date: string; // local date
  quantity: number;
}

export const isTimes = (unit: string) => unit === TIMES_UNIT;

/** Normalizes slotsPerWeek from the goal's shape so callers cannot store an inconsistent goal. */
export function normalizeGoal<T extends Omit<GoalSpec, 'slotsPerWeek'> & { slotsPerWeek?: number }>(g: T): T & { slotsPerWeek: number } {
  const activeWeekdays = [...new Set(g.activeWeekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (g.period === 'daily') return { ...g, activeWeekdays, slotsPerWeek: activeWeekdays.length };
  if (isTimes(g.unit)) return { ...g, activeWeekdays: [1, 2, 3, 4, 5, 6, 7], slotsPerWeek: g.target };
  return { ...g, activeWeekdays: [1, 2, 3, 4, 5, 6, 7], slotsPerWeek: Math.max(1, Math.min(g.target, g.slotsPerWeek ?? 1)) };
}

export function goalProblem(g: GoalSpec): string | null {
  if (!Number.isInteger(g.target) || g.target < 1 || g.target > 10_000) return 'A meta precisa ser um número inteiro entre 1 e 10.000';
  if (!Number.isInteger(g.stakeCents) || g.stakeCents < 1 || g.stakeCents > 100_000_00) return 'O valor da cota precisa ser maior que zero';
  if (g.period === 'daily' && g.activeWeekdays.length === 0) return 'Escolha pelo menos um dia da semana';
  if (g.period === 'weekly' && isTimes(g.unit) && g.target > 50) return 'No máximo 50 vezes por semana';
  if (!Number.isInteger(g.slotsPerWeek) || g.slotsPerWeek < 1 || g.slotsPerWeek > 50) return 'Entre 1 e 50 cotas por semana';
  if (g.period === 'weekly' && g.slotsPerWeek > g.target) return 'Não dá para ter mais cotas do que a meta';
  return null;
}

export function weeklyCommitmentCents(g: Pick<GoalSpec, 'slotsPerWeek' | 'stakeCents'>): number {
  return g.slotsPerWeek * g.stakeCents;
}

export function commitmentCents(goals: Pick<GoalSpec, 'slotsPerWeek' | 'stakeCents'>[]): number {
  return goals.reduce((s, g) => s + weeklyCommitmentCents(g), 0);
}

/** Total quantity per local date. */
function byDate(checkIns: CheckInLike[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of checkIns) m.set(c.date, (m.get(c.date) ?? 0) + c.quantity);
  return m;
}

/**
 * Slots achieved in one week by the valid check-ins of one member on one goal.
 * Never more than slotsPerWeek (over-achieving earns nothing extra).
 */
export function slotsAchieved(g: GoalSpec, checkIns: CheckInLike[]): number {
  if (g.period === 'daily') {
    const active = new Set(g.activeWeekdays);
    let n = 0;
    for (const [date, qty] of byDate(checkIns)) if (active.has(isoWeekday(date)) && qty >= g.target) n++;
    return Math.min(n, g.slotsPerWeek);
  }
  const total = checkIns.reduce((s, c) => s + c.quantity, 0);
  // slot k is paid when total ≥ k·target/slots  ⇔  total·slots ≥ k·target (integers, no floats)
  return Math.min(g.slotsPerWeek, Math.floor((total * g.slotsPerWeek) / g.target));
}

export interface GoalProgress {
  slots: number;
  achieved: number;
  creditedCents: number;
  commitmentCents: number;
  /** Quantity still needed for the next slot (weekly) or today (daily). null when done. */
  toNext: number | null;
  totalQuantity: number;
}

export function goalProgress(g: GoalSpec, checkIns: CheckInLike[], today?: string): GoalProgress {
  const achieved = slotsAchieved(g, checkIns);
  const totalQuantity = checkIns.reduce((s, c) => s + c.quantity, 0);
  let toNext: number | null = null;
  if (achieved < g.slotsPerWeek) {
    if (g.period === 'weekly') {
      const nextThreshold = Math.ceil(((achieved + 1) * g.target) / g.slotsPerWeek);
      toNext = Math.max(1, nextThreshold - totalQuantity);
    } else if (today) {
      const doneToday = checkIns.filter((c) => c.date === today).reduce((s, c) => s + c.quantity, 0);
      toNext = doneToday >= g.target ? null : g.target - doneToday;
    }
  }
  return { slots: g.slotsPerWeek, achieved, creditedCents: achieved * g.stakeCents, commitmentCents: weeklyCommitmentCents(g), toNext, totalQuantity };
}

/** Human description in pt-BR, e.g. "3× por semana" or "10 páginas por dia (seg–sex)". */
export function describeGoal(g: Pick<GoalSpec, 'period' | 'target' | 'unit' | 'activeWeekdays' | 'slotsPerWeek'>): string {
  const per = g.period === 'daily' ? 'por dia' : 'por semana';
  const amount = isTimes(g.unit) ? `${g.target}×` : `${g.target} ${g.unit}`;
  let s = `${amount} ${per}`;
  if (g.period === 'daily' && g.activeWeekdays.length < 7) s += ` (${describeWeekdays(g.activeWeekdays)})`;
  if (g.period === 'weekly' && !isTimes(g.unit) && g.slotsPerWeek > 1) s += ` em ${g.slotsPerWeek} cotas`;
  return s;
}

const WD = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
export function describeWeekdays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join() === '1,2,3,4,5') return 'seg–sex';
  if (sorted.join() === '6,7') return 'fins de semana';
  return sorted.map((d) => WD[d]).join(', ');
}

export const WEEKDAY_LABELS = WD;
