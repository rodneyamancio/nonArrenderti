import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSession, StaleSessionError } from '@/session/session';
import { KEYS } from '@/lib/queue';

const user = { id: 'u1', email: 'a@b.c', name: 'Ana', role: 'user', avatarColor: 'violet' };

function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v), remove: async (k) => void data.delete(k) };
}

const json = (status, body) => new Response(JSON.stringify(body), { status });

/** Fake API: route table of path → handler(init) returning a Response (or a promise of one). */
function fakeFetch(routes, calls = []) {
  return async (url, init) => {
    const path = new URL(url).pathname.replace(/^\/api/, '');
    calls.push({ path, init });
    const h = routes[path];
    if (!h) return json(404, { code: 'not_found', message: 'x' });
    return h(init);
  };
}

test('login asks for a mobile session and stores only the token and profile', async () => {
  const store = memoryStore();
  const calls = [];
  const s = createSession({ baseUrl: 'https://t.test/api', store, fetch: fakeFetch({ '/auth/login': () => json(200, { user, token: 'tok1' }) }, calls) });
  await s.login('a@b.c', 'segredo123');
  assert.equal(JSON.parse(calls[0].init.body).client, 'mobile');
  assert.equal(store.data.get(KEYS.token), 'tok1');
  assert.deepEqual(JSON.parse(store.data.get(KEYS.user)), user);
  assert.ok(![...store.data.values()].some((v) => v.includes('segredo123')), 'password never stored');
  assert.equal(s.getState().status, 'signedIn');
  assert.equal(s.authHeaders().authorization, 'Bearer tok1');
});

test('restore shows the cached profile at once and keeps the session when offline', async () => {
  const store = memoryStore({ [KEYS.token]: 'tok', [KEYS.user]: JSON.stringify(user) });
  const s = createSession({ baseUrl: 'https://t.test/api', store, fetch: async () => Promise.reject(new TypeError('Network request failed')) });
  await s.restore();
  assert.deepEqual(s.getState(), { status: 'signedIn', user });
  assert.equal(store.data.get(KEYS.token), 'tok');
});

test('restore with a revoked token goes to login with a notice', async () => {
  const store = memoryStore({ [KEYS.token]: 'old', [KEYS.user]: JSON.stringify(user) });
  const s = createSession({ baseUrl: 'https://t.test/api', store, fetch: fakeFetch({ '/auth/me': () => json(401, { code: 'session_expired', message: 'x' }) }) });
  await s.restore();
  assert.equal(s.getState().status, 'signedOut');
  assert.match(s.getState().notice, /expirou/);
  assert.equal(store.data.has(KEYS.token), false);
});

test('only a 401 signs out: 5xx and network errors keep the session', async () => {
  const store = memoryStore();
  let mode = 'down';
  const s = createSession({
    baseUrl: 'https://t.test/api',
    store,
    fetch: fakeFetch({
      '/auth/login': () => json(200, { user, token: 't' }),
      '/me/overview': () => (mode === 'down' ? json(503, { code: 'service_unavailable', message: 'x' }) : json(401, { code: 'session_expired', message: 'x' })),
    }),
  });
  await s.login('a@b.c', 'x');
  await assert.rejects(s.request('/me/overview'), { status: 503 });
  assert.equal(s.getState().status, 'signedIn');
  mode = 'revoked';
  await assert.rejects(s.request('/me/overview'));
  assert.equal(s.getState().status, 'signedOut');
});

test('a wrong current password (401 invalid_credentials) does not sign out', async () => {
  const s = createSession({
    baseUrl: 'https://t.test/api',
    store: memoryStore(),
    fetch: fakeFetch({ '/auth/login': () => json(200, { user, token: 't' }), '/auth/password': () => json(401, { code: 'invalid_credentials', message: 'Senha atual incorreta' }) }),
  });
  await s.login('a@b.c', 'x');
  await assert.rejects(s.request('/auth/password', { body: {} }), { code: 'invalid_credentials' });
  assert.equal(s.getState().status, 'signedIn');
});

test('a late 401 from the previous session never signs out whoever logged in after it', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  let n = 0;
  const s = createSession({
    baseUrl: 'https://t.test/api',
    store: memoryStore(),
    fetch: fakeFetch({
      '/auth/login': () => json(200, { user, token: `t${++n}` }),
      '/me/overview': async () => {
        await gate;
        return json(401, { code: 'session_expired', message: 'x' });
      },
    }),
  });
  await s.login('a@b.c', 'x');
  const slow = s.request('/me/overview');
  await s.logout();
  await s.login('a@b.c', 'x');
  release();
  await assert.rejects(slow, StaleSessionError);
  assert.equal(s.getState().status, 'signedIn');
  assert.equal(s.authHeaders().authorization, 'Bearer t2');
});

test('logout clears at once and revokes the old token on the API', async () => {
  const store = memoryStore();
  const calls = [];
  const s = createSession({ baseUrl: 'https://t.test/api', store, fetch: fakeFetch({ '/auth/login': () => json(200, { user, token: 'tokX' }), '/auth/logout': () => json(200, { ok: true }) }, calls) });
  await s.login('a@b.c', 'x');
  await s.logout();
  assert.equal(s.getState().status, 'signedOut');
  assert.equal(store.data.size, 0);
  const revoke = calls.find((c) => c.path === '/auth/logout');
  assert.equal(revoke.init.headers.authorization, 'Bearer tokX');
});

test('if the token cannot be stored, it is revoked and the login fails', async () => {
  const calls = [];
  const store = { get: async () => null, set: async () => Promise.reject(new Error('keychain')), remove: async () => undefined };
  const s = createSession({ baseUrl: 'https://t.test/api', store, fetch: fakeFetch({ '/auth/login': () => json(200, { user, token: 'orphan' }), '/auth/logout': () => json(200, {}) }, calls) });
  await assert.rejects(s.login('a@b.c', 'x'), /guardar a sessão/);
  assert.equal(s.getState().status, 'loading');
  assert.equal(calls.find((c) => c.path === '/auth/logout').init.headers.authorization, 'Bearer orphan');
});
