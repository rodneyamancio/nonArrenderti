'use client';
import { createTransport, type RequestInit } from '@tenace/api-client';

export { ApiError, errorMessage } from '@tenace/api-client';

const PUBLIC_PREFIXES = ['/entrar', '/criar-conta', '/esqueci-senha', '/redefinir-senha', '/convite'];

const request = createTransport({
  baseUrl: '/api',
  credentials: 'same-origin',
  onError: (status, code) => {
    // Blocked account: send the person to the page where they can pay.
    if (status === 403 && code === 'account_blocked' && typeof window !== 'undefined' && !window.location.pathname.startsWith('/assinatura')) window.location.href = '/assinatura';
  },
  onUnauthorized: () => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    if (path !== '/' && !PUBLIC_PREFIXES.some((p) => path.startsWith(p))) window.location.href = `/entrar?next=${encodeURIComponent(path + window.location.search)}`;
  },
});

/** Browser → /api (same-origin proxy). The shared transport sends the CSRF header on every call. */
export function api<T>(path: string, init: Omit<RequestInit, 'raw'> & { raw?: Blob } = {}): Promise<T> {
  const { raw, ...rest } = init;
  return request<T>(path, raw ? { ...rest, raw: { body: raw, contentType: raw.type } } : rest);
}

/** Only same-site relative paths: no open redirect. */
export function safeNext(next: string | null | undefined, fallback = '/inicio'): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
