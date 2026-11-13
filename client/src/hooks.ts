import { useCallback, useEffect, useState } from 'react';

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
  /** Fetch now instead of waiting for the next poll. */
  refresh: () => void;
}

/**
 * Poll an endpoint. A failed poll keeps the previous data and records the error,
 * so the screen never goes blank because the local server hiccupped.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): Polled<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

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
    // A changed nonce restarts the loop immediately (see refresh).
  }, [fetcher, intervalMs, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data: state.data, error: state.error, refresh };
}
