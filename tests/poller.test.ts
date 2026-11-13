import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Poller } from '../server/poller.js';
import { SnapshotStore } from '../server/store.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'poller-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('Poller', () => {
  it('keeps the last good snapshot when a later refresh fails', async () => {
    const store = new SnapshotStore(dir);
    let fail = false;
    const poller = new Poller<{ temp: number }>({
      name: 'weather',
      store,
      intervalMs: () => 60_000,
      run: async () => {
        if (fail) throw new Error('upstream down');
        return { temp: 55 };
      },
    });

    await poller.refresh();
    expect(poller.snapshot?.data.temp).toBe(55);
    expect(poller.health().ok).toBe(true);

    fail = true;
    await poller.refresh();
    expect(poller.snapshot?.data.temp).toBe(55); // not blanked
    expect(poller.health()).toMatchObject({ ok: false, error: 'upstream down', consecutiveFailures: 1 });
  });

  it('restores the snapshot from disk after a restart', async () => {
    const store = new SnapshotStore(dir);
    const first = new Poller<{ temp: number }>({
      name: 'weather',
      store,
      intervalMs: () => 60_000,
      run: async () => ({ temp: 61 }),
    });
    await first.refresh();

    const second = new Poller<{ temp: number }>({
      name: 'weather',
      store,
      intervalMs: () => 60_000,
      run: async () => {
        throw new Error('still offline');
      },
    });
    await second.init();
    expect(second.snapshot?.data.temp).toBe(61);
    expect(typeof second.snapshot?.fetchedAt).toBe('string');
  });

  it('backs off exponentially with a cap', async () => {
    const poller = new Poller<number>({
      name: 'radar',
      store: new SnapshotStore(dir),
      intervalMs: () => 60_000,
      run: async () => 1,
      maxBackoffMs: 120_000,
    });
    // Access failures directly, the way a failed attempt would update them.
    const at = (failures: number): number => {
      (poller as unknown as { failures: number }).failures = failures;
      return poller.backoffMs();
    };
    expect(at(1)).toBeGreaterThanOrEqual(24_000);
    expect(at(1)).toBeLessThanOrEqual(36_000);
    expect(at(3)).toBeGreaterThan(at(1));
    expect(at(20)).toBeLessThanOrEqual(120_000 * 1.2);
  });
});

describe('Poller location keys', () => {
  it('ignores a saved snapshot that belongs to a different location', async () => {
    const store = new SnapshotStore(dir);
    let key = 'A';
    const first = new Poller<number>({
      name: 'weather', store, intervalMs: () => 60_000, run: async () => 1, key: () => key,
    });
    await first.refresh();
    key = 'B';
    const second = new Poller<number>({
      name: 'weather', store, intervalMs: () => 60_000, run: async () => 2, key: () => key,
    });
    await second.init();
    expect(second.snapshot).toBeNull();
  });

  it('discards a result that finishes after the location changed', async () => {
    const store = new SnapshotStore(dir);
    let key = 'A';
    let release!: (v: number) => void;
    const poller = new Poller<number>({
      name: 'weather',
      store,
      intervalMs: () => 60_000,
      run: () => new Promise<number>((resolve) => { release = resolve; }),
      key: () => key,
    });
    const pending = poller.refresh();
    key = 'B';
    release(42);
    await pending;
    expect(poller.snapshot).toBeNull();
  });
});

describe('Poller refresh while busy', () => {
  it('fetches again when a refresh is requested during an attempt', async () => {
    const store = new SnapshotStore(dir);
    let calls = 0;
    let release!: (v: number) => void;
    const poller = new Poller<number>({
      name: 'weather',
      store,
      intervalMs: () => 60_000,
      run: () => {
        calls += 1;
        if (calls === 1) return new Promise<number>((resolve) => { release = resolve; });
        return Promise.resolve(calls);
      },
    });
    poller.start();
    poller.refresh(); // requested while the first attempt is still running
    release(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(2);
    expect(poller.snapshot?.data).toBe(2);
    poller.stop();
  });

  it('does not keep data from a location that changed during the store write', async () => {
    const real = new SnapshotStore(dir);
    let key = 'A';
    let calls = 0;
    let releaseWrite!: () => void;
    const slowStore = {
      read: real.read.bind(real),
      write: async <T,>(name: string, snap: { data: T; fetchedAt: string; locationKey?: string }) => {
        // Hold the write open so the location can change mid-attempt.
        await new Promise<void>((resolve) => { releaseWrite = resolve; });
        return real.write(name, snap);
      },
    } as unknown as SnapshotStore;
    const poller = new Poller<string>({
      name: 'weather',
      store: slowStore,
      intervalMs: () => 60_000,
      run: async () => { calls += 1; return `data-for-${key}`; },
      key: () => key,
    });
    poller.start();
    await new Promise((r) => setTimeout(r, 10)); // first attempt is now waiting on the write
    key = 'B';
    poller.reset();
    poller.refresh();
    releaseWrite();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(poller.snapshot?.data).toBe('data-for-B');
    poller.stop();
  });
});
