import { hmacSha256Hex, safeEqual } from '../../common/crypto';

const TOLERANCE_SEC = 300;

/** Calebe-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>"> */
export function verifyCalebeSignature(header: string | undefined, raw: Buffer, secret: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > TOLERANCE_SEC || !parts.v1) return false;
  const expected = hmacSha256Hex(secret, Buffer.concat([Buffer.from(`${parts.t}.`), raw]));
  return safeEqual(expected, parts.v1);
}
