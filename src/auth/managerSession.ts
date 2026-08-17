import fs from 'fs';
import path from 'path';
import { BrowserContext } from 'playwright';
import { AUTH_DIR } from '../config/paths';
import { logger } from '../logger/logger';
import { withProjectLock } from '../utils/fileLock';

export const MANAGER_STORAGE_STATE = path.join(AUTH_DIR, 'bank-manager.json');

export function hasSavedManagerSession(): boolean {
  if (!fs.existsSync(MANAGER_STORAGE_STATE)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(MANAGER_STORAGE_STATE, 'utf8')) as {
      cookies?: unknown[];
      origins?: unknown[];
    };
    const cookies = Array.isArray(data.cookies) ? data.cookies.length : 0;
    const origins = Array.isArray(data.origins) ? data.origins.length : 0;
    return cookies > 0 || origins > 0;
  } catch {
    return false;
  }
}

export async function saveManagerSession(context: BrowserContext): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await withProjectLock('manager-session', async () => {
    await context.storageState({ path: MANAGER_STORAGE_STATE });
  });
  logger.info(`Saved bank manager session to ${MANAGER_STORAGE_STATE}`);
}

export async function withManagerSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  return withProjectLock('manager-session', fn);
}
