'use client';
import type { OverviewGroup, SessionUser } from '@tenace/types';
import { createContext, useContext, useEffect } from 'react';

export interface CheckInTarget {
  groupId?: string;
  goalId?: string;
}

export interface AppContextValue {
  user: SessionUser;
  setUser: (u: SessionUser) => void;
  groups: OverviewGroup[] | undefined;
  reloadGroups: () => Promise<void>;
  openCheckIn: (target?: CheckInTarget) => void;
  unread: number;
  refreshUnread: () => void;
}

export const AppCtx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(AppCtx);
  if (!v) throw new Error('useApp outside AppShell');
  return v;
}

/** Fired after any change that affects week numbers (check-in, payment…). Pages listen and reload. */
export const DATA_EVENT = 'tenace:data';
export function emitDataChanged() {
  window.dispatchEvent(new Event(DATA_EVENT));
}
export function useOnDataChanged(fn: () => void) {
  useEffect(() => {
    window.addEventListener(DATA_EVENT, fn);
    return () => window.removeEventListener(DATA_EVENT, fn);
  }, [fn]);
}
