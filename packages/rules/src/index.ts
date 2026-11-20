export * from './dates';
export * from './goals';
export * from './pix';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** R$ 1.234,56 — money is always integer cents. */
export function formatCents(cents: number): string {
  return BRL.format(cents / 100).replace(/ /g, ' ');
}

/** Parses "12,50" / "12.50" / "R$ 12" into cents. Returns null when invalid. */
export function parseMoneyToCents(input: string): number | null {
  const s = input.replace(/[R$\s]/g, '').replace(/\./g, (m, i, all: string) => (all.includes(',') ? '' : m)).replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
