// Pure helpers shared by the session and its tests (no React Native imports).

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Writes run in a QUEUE: an old logout still writing can never erase the new session that came after it. */
export function createSerializer() {
  let queue: Promise<unknown> = Promise.resolve();
  return function serialized<T>(write: () => Promise<T>): Promise<T> {
    const next = queue.then(write, write);
    queue = next.catch(() => undefined);
    return next;
  };
}

/** Keys: dots only (SecureStore rejects ':'). */
export const KEYS = { token: 'tenace.session.token', user: 'tenace.session.user', theme: 'tenace.pref.theme' } as const;
