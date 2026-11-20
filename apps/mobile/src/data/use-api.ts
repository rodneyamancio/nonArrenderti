import { useCallback, useEffect, useRef, useState } from 'react';
import { onDataChanged } from '@/lib/events';
import { StaleSessionError } from '@/session/session';
import { api } from '@/session/provider';

/**
 * Read hook: keeps the previous data while refetching (no jump), exposes error, reload and
 * pull-to-refresh state, and reloads quietly when another screen changes the numbers.
 */
export function useApi<T>(path: string | null, { listen = true }: { listen?: boolean } = {}) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(!!path);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'quiet' = 'quiet') => {
      if (!path) return;
      const n = ++seq.current;
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'initial') setLoading(true);
      try {
        const d = await api<T>(path);
        if (n !== seq.current) return;
        setData(d);
        setError(undefined);
      } catch (e) {
        if (n !== seq.current || e instanceof StaleSessionError) return;
        setError(e);
      } finally {
        if (n === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path],
  );

  useEffect(() => {
    setData(undefined);
    void load('initial');
  }, [load]);

  useEffect(() => (listen ? onDataChanged(() => void load('quiet')) : undefined), [listen, load]);

  return { data, error, loading, refreshing, reload: () => load('initial'), refresh: () => load('refresh'), quiet: () => load('quiet'), setData };
}

/** Write helper: one submit at a time, busy flag and the error message for the form. */
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
