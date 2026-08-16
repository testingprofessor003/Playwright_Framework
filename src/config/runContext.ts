import fs from 'fs';
import { lock } from 'proper-lockfile';
import { env } from './env';
import { REPORTS_DIR, RUN_ID_FILE } from './paths';
import { buildRunId } from '../utils/dates';

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

  const release = await lock(RUN_ID_FILE, { retries: { retries: 20, minTimeout: 20 } });
  try {
    const existing = fs.readFileSync(RUN_ID_FILE, 'utf8').trim();
    if (existing) return existing;
    const created = buildRunId(env.browser || 'chrome', env.executionEnv || 'local');
    fs.writeFileSync(RUN_ID_FILE, created, 'utf8');
    return created;
  } finally {
    await release();
  }
}
