// The ONLY owner of the session on the phone (VGStack vg-mobile): reads/writes the token, logs in and out
// and exposes `request()` for every screen. Pure TypeScript — storage and fetch are injected — so the rules
// below are tested in Node without a simulator.
//
// - Token only in the device store; the password is never kept.
// - Writes go through a queue: an old logout still writing never erases a newer session.
// - Session GENERATION: every login/logout bumps a number; an answer from an older generation is dropped,
//   and a late 401 never signs out whoever logged in after it.
// - Only a 401 leads back to login (with a notice). 5xx / no network keeps the session.
// - Logout clears the screen at once and tries to revoke on the API; offline, it expires on the server.
import { ApiError, createTransport, type RequestInit } from '@tenace/api-client';
import type { SessionUser } from '@tenace/types';
import { createSerializer, KEYS, type KeyValueStore } from '../lib/queue';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; notice?: string }
  | { status: 'signedIn'; user: SessionUser };

export class StaleSessionError extends Error {
  constructor() {
    super('stale_session');
    this.name = 'StaleSessionError';
  }
}

export interface SessionDeps {
  baseUrl: string;
  store: KeyValueStore;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface Session {
  getState(): SessionState;
  subscribe(fn: (s: SessionState) => void): () => void;
  /** Opens the app: stored token → cached profile at once, refreshed from /auth/me in the background. */
  restore(): Promise<void>;
  login(email: string, password: string): Promise<SessionUser>;
  signup(name: string, email: string, password: string): Promise<SessionUser>;
  logout(notice?: string): Promise<void>;
  /** After a password change the API already revoked every session: just forget it locally. */
  forget(notice: string): Promise<void>;
  setUser(user: SessionUser): void;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  /** Authorization header for images served by the API (check-in photos). */
  authHeaders(): Record<string, string>;
}

const EXPIRED = 'Sua sessão expirou. Entre novamente.';

/** A 401 means "this session is gone" — except a wrong current password on /auth/password. */
const sessionGone = (e: unknown) => e instanceof ApiError && e.status === 401 && e.code !== 'invalid_credentials';

export function createSession(deps: SessionDeps): Session {
  const serialized = createSerializer();
  let token: string | null = null;
  let generation = 0;
  let state: SessionState = { status: 'loading' };
  const listeners = new Set<(s: SessionState) => void>();

  const set = (next: SessionState) => {
    state = next;
    for (const l of [...listeners]) l(state);
  };

  // `tokenOverride` lets logout revoke the token it just dropped.
  const transport = (tokenOverride?: string) =>
    createTransport({
      baseUrl: deps.baseUrl,
      fetch: deps.fetch,
      timeoutMs: deps.timeoutMs ?? 20_000,
      headers: (): Record<string, string> => {
        const t = tokenOverride ?? token;
        return t ? { authorization: `Bearer ${t}` } : {};
      },
    });
  const plain = transport();

  async function persist(newToken: string, user: SessionUser) {
    await serialized(async () => {
      await deps.store.set(KEYS.token, newToken);
      await deps.store.set(KEYS.user, JSON.stringify(user));
    });
  }

  async function clearStored() {
    await serialized(async () => {
      await deps.store.remove(KEYS.token);
      await deps.store.remove(KEYS.user);
    }).catch(() => undefined);
  }

  async function adopt(result: { user: SessionUser; token?: string }): Promise<SessionUser> {
    if (!result.token) throw new ApiError(0, 'session_missing', 'A API não devolveu a sessão do app.');
    const gen = ++generation;
    try {
      await persist(result.token, result.user);
    } catch {
      // Could not keep it on this device: revoke it instead of leaving an orphan session on the server.
      await transport(result.token)('/auth/logout', { method: 'POST' }).catch(() => undefined);
      throw new ApiError(0, 'session_store_failed', 'Não foi possível guardar a sessão neste aparelho. Tente de novo.');
    }
    if (gen !== generation) throw new StaleSessionError();
    token = result.token;
    set({ status: 'signedIn', user: result.user });
    return result.user;
  }

  async function expire(gen: number) {
    if (gen !== generation || !token) return;
    generation++;
    token = null;
    set({ status: 'signedOut', notice: EXPIRED });
    await clearStored();
  }

  const session: Session = {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },

    async restore() {
      const gen = generation;
      let stored: string | null = null;
      let cached: SessionUser | null = null;
      try {
        stored = await deps.store.get(KEYS.token);
        const raw = await deps.store.get(KEYS.user);
        cached = raw ? (JSON.parse(raw) as SessionUser) : null;
      } catch {
        stored = null;
      }
      if (gen !== generation) return; // a login happened meanwhile
      if (!stored) return set({ status: 'signedOut' });
      token = stored;
      if (cached) set({ status: 'signedIn', user: cached });
      try {
        const r = await plain<{ user: SessionUser }>('/auth/me');
        if (gen !== generation) return;
        set({ status: 'signedIn', user: r.user });
        void serialized(() => deps.store.set(KEYS.user, JSON.stringify(r.user))).catch(() => undefined);
      } catch (e) {
        if (gen !== generation) return;
        if (sessionGone(e)) return expire(gen);
        // Offline / API down: keep the session. Without a cached profile we still need someone to show.
        if (!cached) set({ status: 'signedIn', user: { id: '', email: '', name: '', role: 'user', avatarColor: 'violet' } });
      }
    },

    async login(email, password) {
      const r = await plain<{ user: SessionUser; token?: string }>('/auth/login', { body: { email, password, client: 'mobile' } });
      return adopt(r);
    },

    async signup(name, email, password) {
      const r = await plain<{ user: SessionUser; token?: string }>('/auth/signup', { body: { name, email, password, client: 'mobile' } });
      return adopt(r);
    },

    async logout(notice) {
      const old = token;
      generation++;
      token = null;
      set({ status: 'signedOut', notice });
      await clearStored();
      if (old) await transport(old)('/auth/logout', { method: 'POST' }).catch(() => undefined);
    },

    async forget(notice) {
      generation++;
      token = null;
      set({ status: 'signedOut', notice });
      await clearStored();
    },

    setUser(user) {
      if (state.status !== 'signedIn') return;
      set({ status: 'signedIn', user });
      void serialized(() => deps.store.set(KEYS.user, JSON.stringify(user))).catch(() => undefined);
    },

    async request<T>(path: string, init?: RequestInit): Promise<T> {
      const gen = generation;
      try {
        const r = await plain<T>(path, init);
        if (gen !== generation) throw new StaleSessionError();
        return r;
      } catch (e) {
        if (sessionGone(e)) await expire(gen);
        if (gen !== generation && !(e instanceof StaleSessionError)) throw new StaleSessionError();
        throw e;
      }
    },

    authHeaders: (): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {}),
  };
  return session;
}
