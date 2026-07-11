import { useEffect, useRef, useState } from 'react';

export interface ApiJsonState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Poll a local /api route with gentle cadence; degrades to error state quietly. */
export const useApiJson = <T = Record<string, unknown>>(path: string, refreshMs = 60_000): ApiJsonState<T> => {
  const [state, setState] = useState<ApiJsonState<T>>({ data: null, error: null, loading: true });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(path, { headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`${path} ${response.status}`);
        const data = (await response.json()) as T;
        if (cancelled) return;
        setState({ data, error: null, loading: false });
      } catch (error) {
        if (cancelled) return;
        setState((previous) => ({ data: previous.data, error: error instanceof Error ? error.message : String(error), loading: false }));
      }
      timerRef.current = setTimeout(tick, refreshMs);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [path, refreshMs]);

  return state;
};
