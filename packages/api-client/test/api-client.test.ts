import { describe, expect, it, vi } from 'vitest';
import { ApiError, createTransport, errorMessage, inviteTokenFrom, NetworkError } from '../src';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createTransport', () => {
  it('sends JSON with the CSRF and injected headers', async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => json(200, { ok: true }));
    const request = createTransport({ baseUrl: 'https://x.test/api/', headers: () => ({ authorization: 'Bearer abc' }), fetch: f as unknown as typeof fetch });
    await expect(request('/groups', { body: { a: 1 } })).resolves.toEqual({ ok: true });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://x.test/api/groups');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-requested-with']).toBe('tenace');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer abc');
    expect(init.body).toBe('{"a":1}');
  });

  it('maps API errors and calls onUnauthorized only on 401', async () => {
    const onUnauthorized = vi.fn();
    const f = vi.fn().mockResolvedValueOnce(json(401, { code: 'session_expired', message: 'x' })).mockResolvedValueOnce(json(503, { code: 'service_unavailable', message: 'y' }));
    const request = createTransport({ baseUrl: '/api', onUnauthorized, fetch: f as unknown as typeof fetch });
    await expect(request('/me')).rejects.toMatchObject({ status: 401, code: 'session_expired' });
    await expect(request('/me')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('turns fetch failures into NetworkError (never a logout)', async () => {
    const onUnauthorized = vi.fn();
    const request = createTransport({ baseUrl: '/api', onUnauthorized, fetch: (async () => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch });
    const err = await request('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(errorMessage(err)).toMatch(/conexão/);
  });

  it('times out', async () => {
    const slow = ((_: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const request = createTransport({ baseUrl: '/api', timeoutMs: 20, fetch: slow });
    const err = await request('/me').catch((e: unknown) => e);
    expect(err).toMatchObject({ timedOut: true });
  });
});

describe('errorMessage', () => {
  it('prefers the first validation issue, then the stable message', () => {
    expect(errorMessage(new ApiError(400, 'validation_error', 'x', { issues: [{ message: 'Nome curto' }] }))).toBe('Nome curto');
    expect(errorMessage(new ApiError(401, 'invalid_credentials', 'x'))).toBe('E-mail ou senha incorretos.');
    expect(errorMessage(new ApiError(409, 'already_member', 'Você já está no grupo'))).toBe('Você já está no grupo');
  });
});

describe('inviteTokenFrom', () => {
  it('accepts links and bare tokens', () => {
    expect(inviteTokenFrom('https://tenace.amancio.family/convite/abcDEF123_-xyz789')).toBe('abcDEF123_-xyz789');
    expect(inviteTokenFrom('  abcdefghijklmnopq ')).toBe('abcdefghijklmnopq');
    expect(inviteTokenFrom('oi')).toBeNull();
  });
});
