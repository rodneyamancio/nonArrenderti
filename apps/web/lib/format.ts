export { formatCents, describeGoal, isTimes } from '@tenace/rules';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

/** "16 nov" for a local date (YYYY-MM-DD). */
export const fmtDay = (d: string) => dayMonth.format(new Date(`${d}T12:00:00Z`)).replace('.', '');
export const fmtWeekday = (d: string) => weekdayFmt.format(new Date(`${d}T12:00:00Z`)).replace('.', '');
export const fmtDateTime = (iso: string) => dateTime.format(new Date(iso));
export const fmtRange = (a: string, b: string) => {
  const [, ma] = a.split('-');
  const [, mb] = b.split('-');
  return ma === mb ? `${Number(a.slice(8))}–${fmtDay(b)}` : `${fmtDay(a)} – ${fmtDay(b)}`;
};

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  return dateOnly.format(new Date(iso));
}

/** "2d 5h", "3h 20min", "12 min". */
export function countdown(toIso: string): string {
  const ms = new Date(toIso).getTime() - Date.now();
  if (ms <= 0) return 'agora';
  const min = Math.floor(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${min % 60}min`;
  return `${min} min`;
}

export function unitLabel(unit: string, n: number): string {
  if (unit === 'times') return n === 1 ? 'vez' : 'vezes';
  return unit;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export const ENTRY_LABELS: Record<string, string> = {
  COMMITMENT: 'Compromisso',
  SLOT_CREDIT: 'Cota paga',
  SLOT_REVERSAL: 'Estorno',
  PAYMENT: 'Pagamento',
  ADJUSTMENT: 'Ajuste',
  PENALTY_ASSESSED: 'Multa',
  PENALTY_ADJUSTED: 'Ajuste de multa',
  PAYMENT_RECEIVED: 'Pagamento recebido',
  WAIVER: 'Abono',
  EXPENSE: 'Saída',
};
