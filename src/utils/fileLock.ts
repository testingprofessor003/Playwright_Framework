import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { lock } from 'proper-lockfile';

/**
 * OneDrive (this repo lives under Desktop) delays utimes on lockfiles, which
 * makes proper-lockfile throw "Unable to update lock within the stale threshold"
 * when a lock is held longer than the default 10s stale window.
 *
 * Lock files live in os.tmpdir(), not reports/.
 */
const LOCK_OPTIONS = {
  stale: 120000,
  update: 60000,
  realpath: false,
  retries: { retries: 40, minTimeout: 100, maxTimeout: 2000 },
};

function projectLockFile(name: string): string {
  const id = createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `pw-fw-${id}-${name}.lock`);
}

export async function withProjectLock<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const file = projectLockFile(name);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '', 'utf8');
  }
  const release = await lock(file, LOCK_OPTIONS);
  try {
    return await fn();
  } finally {
    await release().catch(() => undefined);
  }
}
