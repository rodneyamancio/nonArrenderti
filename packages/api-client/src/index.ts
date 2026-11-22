/**
 * Transport shared by the web portal and the Expo app: one envelope, one error shape and one
 * set of pt-BR messages. Each face injects how it authenticates (web: same-origin cookie +
 * CSRF header; mobile: `Authorization: Bearer`) and what a 401 means for it.
 */
import type { ErrorCode } from '@tenace/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | string,
    message: string,
    readonly params?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown when the request never got an HTTP answer (offline, DNS, timeout). Never logs anyone out. */
export class NetworkError extends Error {
  constructor(readonly timedOut = false) {
    super(timedOut ? 'timeout' : 'network');
    this.name = 'NetworkError';
  }
}

export const ERROR_MESSAGES: Partial<Record<ErrorCode | string, string>> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  session_expired: 'Sua sessão expirou. Entre novamente.',
  rate_limited: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  insufficient_permission: 'Você não tem permissão para esta ação.',
  service_unavailable: 'Serviço indisponível no momento. Tente de novo em instantes.',
  csrf_rejected: 'Requisição recusada. Recarregue a página.',
  internal_error: 'Algo deu errado do nosso lado. Tente de novo.',
  group_not_found: 'Grupo não encontrado — ou você não faz parte dele.',
  billing_unavailable: 'Pagamentos indisponíveis no momento. Tente de novo em instantes.',
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'validation_error' && Array.isArray(e.params?.issues)) {
      const first = (e.params.issues as { message?: string }[])[0];
      if (first?.message) return first.message;
    }
    return ERROR_MESSAGES[e.code] ?? e.message;
  }
  if (e instanceof NetworkError && e.timedOut) return 'A conexão demorou demais. Tente de novo.';
  return 'Não foi possível concluir. Verifique sua conexão.';
}

export interface RequestInit {
  method?: string;
  body?: unknown;
  /** Raw bytes (photo upload): sent as-is with its own content type. */
  raw?: { body: unknown; contentType: string };
  signal?: AbortSignal;
}

export interface TransportOptions {
  /** '/api' on the web (same-origin proxy), 'https://host/api' on the phone. */
  baseUrl: string;
  /** Extra headers per call (Authorization on mobile). */
  headers?: () => Record<string, string>;
  credentials?: 'same-origin' | 'omit' | 'include';
  /** Called on 401 before the error is thrown. */
  onUnauthorized?: (path: string) => void;
  /** Called on every API error (status + stable code) before it is thrown. */
  onError?: (status: number, code: string, path: string) => void;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

/** CSRF header the API requires on cookie-authenticated writes; harmless with Bearer. */
export const CSRF_HEADERS = { 'x-requested-with': 'tenace' } as const;

export function createTransport(opts: TransportOptions): Request {
  const base = opts.baseUrl.replace(/\/+$/, '');
  return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const doFetch = opts.fetch ?? fetch;
    const headers: Record<string, string> = { ...CSRF_HEADERS, accept: 'application/json', ...(opts.headers?.() ?? {}) };
    let body: unknown;
    if (init.raw) {
      headers['content-type'] = init.raw.contentType;
      body = init.raw.body;
    } else if (init.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.body);
    }

    // Timeout and the caller's abort share one controller.
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, opts.timeoutMs)
      : null;
    const onAbort = () => ctrl.abort();
    init.signal?.addEventListener('abort', onAbort);

    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method: init.method ?? (body !== undefined ? 'POST' : 'GET'),
        headers,
        body: body as BodyInit | undefined,
        credentials: opts.credentials,
        signal: ctrl.signal,
      });
    } catch (e) {
      if (init.signal?.aborted) throw e;
      throw new NetworkError(timedOut);
    } finally {
      if (timer) clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }

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
      const code = b.code ?? 'internal_error';
      if (res.status === 401) opts.onUnauthorized?.(path);
      opts.onError?.(res.status, code, path);
      throw new ApiError(res.status, code, message, b.params);
    }
    return data as T;
  };
}

/** Extracts an invite token from a pasted link (".../convite/<token>") or a bare token. */
export function inviteTokenFrom(input: string): string | null {
  const s = input.trim();
  return /convite\/([A-Za-z0-9_-]+)/.exec(s)?.[1] ?? (/^[A-Za-z0-9_-]{16,}$/.test(s) ? s : null);
}
