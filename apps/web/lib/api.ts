'use client';
import type { ErrorCode } from '@tenace/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | string,
    message: string,
    readonly params?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const MESSAGES: Partial<Record<string, string>> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  session_expired: 'Sua sessão expirou. Entre novamente.',
  rate_limited: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  insufficient_permission: 'Você não tem permissão para esta ação.',
  service_unavailable: 'Serviço indisponível no momento. Tente de novo em instantes.',
  csrf_rejected: 'Requisição recusada. Recarregue a página.',
  internal_error: 'Algo deu errado do nosso lado. Tente de novo.',
  group_not_found: 'Grupo não encontrado — ou você não faz parte dele.',
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'validation_error' && Array.isArray(e.params?.issues)) {
      const first = (e.params.issues as { message: string }[])[0];
      if (first?.message) return first.message;
    }
    return MESSAGES[e.code] ?? e.message;
  }
  return 'Não foi possível concluir. Verifique sua conexão.';
}

const PUBLIC_PREFIXES = ['/entrar', '/criar-conta', '/esqueci-senha', '/redefinir-senha', '/convite'];

/** Browser → /api (same origin). Sends the CSRF header on every call. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; raw?: Blob } = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'tenace' };
  let body: BodyInit | undefined;
  if (init.raw) {
    headers['content-type'] = init.raw.type;
    body = init.raw;
  } else if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  const res = await fetch(`/api${path}`, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin', signal: init.signal });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const b = (data ?? {}) as { code?: string; message?: string | string[]; params?: Record<string, unknown> };
    const message = Array.isArray(b.message) ? b.message.join(', ') : (b.message ?? res.statusText);
    if (res.status === 401 && typeof window !== 'undefined' && !PUBLIC_PREFIXES.some((p) => window.location.pathname.startsWith(p)) && window.location.pathname !== '/') {
      window.location.href = `/entrar?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new ApiError(res.status, b.code ?? 'internal_error', message, b.params);
  }
  return data as T;
}

/** Only same-site relative paths: no open redirect. */
export function safeNext(next: string | null | undefined, fallback = '/inicio'): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
