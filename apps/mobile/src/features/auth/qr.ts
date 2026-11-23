// Pure rules of the QR login (no React Native imports) — tested in Node.

export type QrParse = { ok: true; secret: string } | { ok: false; error: string };

const origin = (u: string) => {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
};

/**
 * `tenace://entrar?c=<secret>&a=<portal>`. A QR from another server (e.g. local vs production)
 * is refused showing both addresses, so test and real accounts never mix.
 */
export function parseLoginQr(data: string, portalUrl: string): QrParse {
  const raw = data.trim();
  const m = /^tenace:\/\/entrar\?(.+)$/i.exec(raw) ?? /^https?:\/\/[^/]+\/--\/entrar\?(.+)$/i.exec(raw);
  if (!m) return { ok: false, error: 'Este QR Code não é de login do Tenace.' };
  const params = new URLSearchParams(m[1]);
  const secret = params.get('c') ?? '';
  const server = params.get('a') ?? '';
  if (secret.length < 20) return { ok: false, error: 'QR Code incompleto. Gere um novo no portal.' };
  if (server && origin(server) !== origin(portalUrl)) {
    return { ok: false, error: `Este QR é de outro servidor (${origin(server) || server}). O app está ligado a ${origin(portalUrl)}.` };
  }
  return { ok: true, secret };
}

/** "abcd efgh", "ABCD-EFGH" → "ABCD-EFGH" (O→0, I/L→1), or null while incomplete. */
export function normalizeShortCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

/** Bytes → lowercase hex (the verifier sent at claim; only its SHA-256 goes at scan). */
export const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
