import type { ProviderHealth } from '../shared/types.js';
import type { Snapshot, SnapshotStore } from './store.js';

export interface PollerOptions<T> {
  name: string;
  store: SnapshotStore;
  run: () => Promise<T>;
  intervalMs: () => number;
  maxBackoffMs?: number;
  /** What the data depends on (location, units). Snapshots for another key are not used. */
  key?: () => string;
}

const BASE_BACKOFF_MS = 30_000;
const DEFAULT_MAX_BACKOFF_MS = 15 * 60_000;

/**
 * Refreshes one upstream data source on a timer. On failure it keeps the last
 * good snapshot and retries with capped exponential backoff plus jitter.
 */
export class Poller<T> {
  snapshot: Snapshot<T> | null = null;
  error: string | null = null;
  failures = 0;
  private lastAttempt: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private running = false;
  /** Set when refresh() is requested while an attempt is already running. */
  private pending = false;

  constructor(private readonly opts: PollerOptions<T>) {}

  get name(): string {
    return this.opts.name;
  }

  async init(): Promise<void> {
    const saved = await this.opts.store.read<T>(this.opts.name);
    const key = this.opts.key?.();
    this.snapshot = saved && (key === undefined || saved.locationKey === key) ? saved : null;
  }

  start(): void {
    this.running = true;
    void this.refresh();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
  }

  /** Runs one refresh now. Concurrent callers share the same in-flight attempt. */
  refresh(): Promise<void> {
    if (this.inFlight) {
      // Do not drop this request. Run again as soon as the current attempt finishes,
      // in case it started before a settings change.
      this.pending = true;
      return this.inFlight;
    }
    this.clearTimer();
    this.inFlight = this.attempt().finally(() => {
      this.inFlight = null;
      if (this.pending) {
        this.pending = false;
        this.schedule(0);
      }
    });
    return this.inFlight;
  }

  /** Drop the current data, for example after the location changed. */
  reset(): void {
    this.snapshot = null;
    this.error = null;
    this.failures = 0;
  }

  health(): ProviderHealth {
    return {
      name: this.opts.name,
      ok: this.error === null && this.snapshot !== null,
      lastSuccess: this.snapshot?.fetchedAt ?? null,
      lastAttempt: this.lastAttempt,
      error: this.error,
      consecutiveFailures: this.failures,
    };
  }

  backoffMs(): number {
    const cap = this.opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    const base = Math.min(cap, BASE_BACKOFF_MS * 2 ** Math.min(this.failures - 1, 10));
    return Math.round(base * (0.8 + Math.random() * 0.4));
  }

  private async attempt(): Promise<void> {
    this.lastAttempt = new Date().toISOString();
    const key = this.opts.key?.();
    try {
      const data = await this.opts.run();
      // Settings changed while this request was running. Discard the result and fetch again.
      if (this.opts.key && this.opts.key() !== key) {
        this.schedule(0);
        return;
      }
      const snapshot: Snapshot<T> = { data, fetchedAt: new Date().toISOString(), locationKey: key };
      this.snapshot = snapshot;
      this.error = null;
      this.failures = 0;
      await this.opts.store.write(this.opts.name, snapshot).catch(() => {
        console.warn(`[${this.opts.name}] could not persist snapshot to disk`);
      });
      this.schedule(this.opts.intervalMs());
    } catch (err) {
      this.failures += 1;
      this.error = err instanceof Error ? err.message : String(err);
      console.warn(`[${this.opts.name}] refresh failed (attempt ${this.failures}): ${this.error}`);
      this.schedule(this.backoffMs());
    }
  }

  private schedule(ms: number): void {
    if (!this.running) return;
    this.clearTimer();
    this.timer = setTimeout(() => void this.refresh(), ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
