import type { OverviewGroup } from '@tenace/types';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useApi } from '@/data/use-api';
import { api } from './provider';

export interface CheckInTarget {
  groupId?: string;
  goalId?: string;
}

interface AppData {
  groups: OverviewGroup[] | undefined;
  groupsError: unknown;
  groupsRefreshing: boolean;
  reloadGroups: () => void;
  refreshGroups: () => void;
  unread: number;
  refreshUnread: () => void;
  checkIn: CheckInTarget | null;
  openCheckIn: (t?: CheckInTarget) => void;
  closeCheckIn: () => void;
}

const Ctx = createContext<AppData | null>(null);

/** Same shared state as the portal's AppShell: my groups (overview), unread notices, the check-in sheet. */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const overview = useApi<{ groups: OverviewGroup[] }>('/me/overview');
  const [unread, setUnread] = useState(0);
  const [checkIn, setCheckIn] = useState<CheckInTarget | null>(null);

  const refreshUnread = useCallback(() => {
    api<{ unread: number }>('/notifications/unread')
      .then((r) => setUnread(r.unread))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshUnread();
    const t = setInterval(refreshUnread, 60_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        refreshUnread();
        void overview.quiet();
      }
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshUnread]);

  return (
    <Ctx.Provider
      value={{
        groups: overview.data?.groups,
        groupsError: overview.error,
        groupsRefreshing: overview.refreshing,
        reloadGroups: () => void overview.reload(),
        refreshGroups: () => void overview.refresh(),
        unread,
        refreshUnread,
        checkIn,
        openCheckIn: (t) => setCheckIn(t ?? {}),
        closeCheckIn: () => setCheckIn(null),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData outside AppDataProvider');
  return v;
}
