import { promises as fs } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomicFile.js';

/** A successful upstream result plus when it was fetched. */
export interface Snapshot<T> {
  data: T;
  fetchedAt: string;
}

/** Disk-backed last-good snapshots, so a reboot during an outage still shows data. */
export class SnapshotStore {
  constructor(private readonly dir: string) {}

  private file(key: string): string {
    return path.join(this.dir, `${key}.json`);
  }

  async read<T>(key: string): Promise<Snapshot<T> | null> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file(key), 'utf8')) as Snapshot<T>;
      if (!parsed || typeof parsed.fetchedAt !== 'string' || parsed.data === undefined) {
        console.warn(`[store] ignoring malformed snapshot "${key}"`);
        return null;
      }
      return parsed;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') console.warn(`[store] could not read snapshot "${key}"`);
      return null;
    }
  }

  async write<T>(key: string, snapshot: Snapshot<T>): Promise<void> {
    await writeFileAtomic(this.file(key), JSON.stringify(snapshot));
  }
}
