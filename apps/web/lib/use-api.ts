'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** Minimal data hook: keeps the previous data while refetching (no layout jump), exposes error + reload. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(!!path);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError(undefined);
    try {
      const d = await api<T>(path, { signal: c.signal });
      if (!c.signal.aborted) setData(d);
    } catch (e) {
      if (!c.signal.aborted) setError(e);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
    return () => ctrl.current?.abort();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
