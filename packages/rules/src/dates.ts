/**
 * Calendar math on local dates ("YYYY-MM-DD") in a given IANA time zone.
 * A local date is a plain string: it never carries a time zone by itself.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The local calendar date of an instant in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Monday of the week that contains `date`. */
export function weekStartOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Offset (ms) of `timeZone` from UTC at `instant`: local wall time − UTC. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant when local `date` starts (00:00) in `timeZone`. DST-safe. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let instant = guess - zoneOffsetMs(new Date(guess), timeZone);
  // Second pass: the offset at the real instant may differ from the guess (DST edge).
  instant = guess - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

export interface WeekWindow {
  weekStart: string;
  weekEnd: string; // Sunday (inclusive)
  opensAt: Date;
  endsAt: Date; // next Monday 00:00 local
  closesAt: Date; // endsAt + grace
}

export function weekWindow(weekStart: string, timeZone: string, graceHours: number): WeekWindow {
  const endsAt = startOfLocalDay(addDays(weekStart, 7), timeZone);
  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    opensAt: startOfLocalDay(weekStart, timeZone),
    endsAt,
    closesAt: new Date(endsAt.getTime() + graceHours * 3_600_000),
  };
}

/** Local dates of a week (Mon..Sun). */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * Whether a check-in on local `date` is accepted at `now`.
 * Allowed: any day of the current week up to today, or a day of the previous
 * week while that week is still inside its grace period. Never the future.
 */
export function checkInWindow(date: string, now: Date, timeZone: string, graceHours: number): { ok: true; weekStart: string } | { ok: false; reason: 'future' | 'too_old' } {
  const today = localDate(now, timeZone);
  if (date > today) return { ok: false, reason: 'future' };
  const currentWeek = weekStartOf(today);
  const ws = weekStartOf(date);
  if (ws === currentWeek) return { ok: true, weekStart: ws };
  if (ws === addDays(currentWeek, -7) && now < weekWindow(ws, timeZone, graceHours).closesAt) return { ok: true, weekStart: ws };
  return { ok: false, reason: 'too_old' };
}
