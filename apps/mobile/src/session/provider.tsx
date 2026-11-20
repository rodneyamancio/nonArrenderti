import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { apiUrl } from '@/lib/config';
import { deviceStore } from '@/lib/storage';
import { createSession, type Session, type SessionState } from './session';

// One session for the whole app (module singleton): the provider only subscribes to it.
export const session: Session = createSession({ baseUrl: apiUrl, store: deviceStore });

const Ctx = createContext<Session>(session);

export function SessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void session.restore();
  }, []);
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useSessionState(): SessionState {
  const s = useContext(Ctx);
  return useSyncExternalStore(s.subscribe, s.getState, s.getState);
}

export function useSession(): Session {
  return useContext(Ctx);
}

/** The signed-in user (only inside the (app) group, which is guarded). */
export function useUser() {
  const state = useSessionState();
  return useMemo(() => (state.status === 'signedIn' ? state.user : null), [state]);
}

export const api = <T,>(path: string, init?: Parameters<Session['request']>[1]) => session.request<T>(path, init);
