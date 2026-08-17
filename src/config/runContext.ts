import fs from 'fs';
import { env } from './env';
import { REPORTS_DIR, RUN_ID_FILE } from './paths';
import { buildRunId } from '../utils/dates';
import { withProjectLock } from '../utils/fileLock';

export function getWorkerId(): string {
  return process.env.CUCUMBER_WORKER_ID || process.pid.toString();
}

export function getRunName(): string {
  return env.runName || `${(env.browser || 'chrome')} ${(env.executionEnv || 'local')}`;
}

export async function getOrCreateRunId(): Promise<string> {
  if (env.runId) return env.runId;
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  if (!fs.existsSync(RUN_ID_FILE)) {
    fs.writeFileSync(RUN_ID_FILE, '', 'utf8');
  }

  const existing = await withProjectLock('run-id', async () => {
    const current = fs.readFileSync(RUN_ID_FILE, 'utf8').trim();
    if (current) return current;
    const created = buildRunId(env.browser || 'chrome', env.executionEnv || 'local');
    fs.writeFileSync(RUN_ID_FILE, created, 'utf8');
    return created;
  });
  return existing;
}
