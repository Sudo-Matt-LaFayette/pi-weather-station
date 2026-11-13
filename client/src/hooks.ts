import { useEffect, useState } from 'react';

/** Current time, updated on an interval, so labels such as "5 min ago" stay current. */
export function useNow(periodMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(id);
  }, [periodMs]);
  return now;
}

export interface Polled<T> {
  data: T | null;
  error: string | null;
}

/**
 * Poll an endpoint. A failed poll keeps the previous data and records the error,
 * so the screen never goes blank because the local server hiccupped.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): Polled<T> {
  const [state, setState] = useState<Polled<T>>({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async (): Promise<void> => {
      try {
        const data = await fetcher();
        if (alive) setState({ data, error: null });
      } catch (err) {
        if (alive) {
          setState((prev) => ({
            data: prev.data,
            error: err instanceof Error ? err.message : 'Request failed',
          }));
        }
      } finally {
        if (alive) timer = setTimeout(run, intervalMs);
      }
    };
    void run();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [fetcher, intervalMs]);
  return state;
}
