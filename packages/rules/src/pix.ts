/**
 * Static PIX "copia e cola" (EMV BR Code), generated locally — no payment provider.
 * Spec: Manual de Padrões para Iniciação do Pix (BCB), static QR with amount.
 */

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Removes accents and anything outside the BR Code safe charset. */
function sanitize(value: string, max: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .\-@]/g, '')
    .trim()
    .slice(0, max);
}

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

export function normalizePixKey(type: PixKeyType, key: string): string {
  const k = key.trim();
  switch (type) {
    case 'cpf':
    case 'cnpj':
      return k.replace(/\D/g, '');
    case 'phone': {
      const d = k.replace(/\D/g, '');
      return d.startsWith('55') && d.length >= 12 ? `+${d}` : `+55${d}`;
    }
    case 'email':
      return k.toLowerCase();
    default:
      return k.toLowerCase();
  }
}

export function pixKeyProblem(type: PixKeyType, key: string): string | null {
  const k = normalizePixKey(type, key);
  if (type === 'cpf' && k.length !== 11) return 'CPF deve ter 11 dígitos';
  if (type === 'cnpj' && k.length !== 14) return 'CNPJ deve ter 14 dígitos';
  if (type === 'phone' && !/^\+55\d{10,11}$/.test(k)) return 'Telefone com DDD, ex.: (11) 91234-5678';
  if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k)) return 'E-mail inválido';
  if (type === 'random' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k)) return 'Chave aleatória inválida';
  return null;
}

export interface PixInput {
  keyType: PixKeyType;
  key: string;
  name: string;
  city: string;
  amountCents?: number;
  description?: string;
  txid?: string;
}

export function pixPayload(input: PixInput): string {
  const key = normalizePixKey(input.keyType, input.key);
  const desc = input.description ? sanitize(input.description, 40) : '';
  const account = field('00', 'br.gov.bcb.pix') + field('01', key) + (desc ? field('02', desc) : '');
  const txid = (input.txid ?? '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  let p =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (input.amountCents && input.amountCents > 0 ? field('54', (input.amountCents / 100).toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', sanitize(input.name, 25).toUpperCase() || 'TENACE') +
    field('60', sanitize(input.city, 15).toUpperCase() || 'BRASIL') +
    field('62', field('05', txid === '***' ? '***' : txid));
  p += '6304';
  return p + crc16(p);
}
