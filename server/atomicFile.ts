import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/** Write to a temp file in the same directory, then rename over the target. */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
}
