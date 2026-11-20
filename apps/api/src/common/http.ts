/** Outbound HTTP with timeout, no redirects, bounded response, and safe error text (no secrets echoed). */
export class OutboundError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; data: T; headers: Headers }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(init.timeoutMs ?? 20_000) });
  } catch (e) {
    throw new OutboundError(`Falha de conexão: ${(e as Error).name === 'TimeoutError' ? 'tempo esgotado' : (e as Error).message}`);
  }
  const text = (await res.text()).slice(0, 256 * 1024);
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string }; message?: string } | null) ?? {};
    const detail = err.error?.code ?? err.error?.message ?? err.message ?? res.statusText;
    throw new OutboundError(`HTTP ${res.status}: ${String(detail).slice(0, 200)}`, res.status, data);
  }
  return { status: res.status, data: data as T, headers: res.headers };
}
