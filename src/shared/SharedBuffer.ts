import { lock } from 'proper-lockfile';
import { SHARED_BUFFER_FILE, REPORTS_DIR } from '../config/paths';
import { SharedStoreError } from '../errors/errors';
import { env } from '../config/env';
import { deleteSharedKv, getSharedKv, upsertSharedKv } from '../db/repository';
import fs from 'fs';

export type BufferScope = 'scenario' | 'worker' | 'global';

export interface SetOptions {
  scope?: BufferScope;
  ttlMs?: number;
}

interface StoredEntry {
  value: unknown;
  expiresAt?: number;
}

const workerStore = new Map<string, StoredEntry>();

function isExpired(entry: StoredEntry): boolean {
  return Boolean(entry.expiresAt && Date.now() > entry.expiresAt);
}

function unwrap<T>(entry: StoredEntry | undefined): T | undefined {
  if (!entry || isExpired(entry)) return undefined;
  return entry.value as T;
}

async function withFileLock<T>(fn: () => Promise<T> | T): Promise<T> {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  if (!fs.existsSync(SHARED_BUFFER_FILE)) {
    fs.writeFileSync(SHARED_BUFFER_FILE, '{}', 'utf8');
  }
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lock(SHARED_BUFFER_FILE, { retries: { retries: 15, minTimeout: 30 } });
    return await fn();
  } catch (error) {
    throw new SharedStoreError(
      `Shared buffer file lock failed: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'sharedBuffer.lock', cause: error },
    );
  } finally {
    if (release) {
      await release();
    }
  }
}

function readFileStore(): Record<string, StoredEntry> {
  try {
    return JSON.parse(fs.readFileSync(SHARED_BUFFER_FILE, 'utf8') || '{}') as Record<string, StoredEntry>;
  } catch {
    return {};
  }
}

function writeFileStore(store: Record<string, StoredEntry>): void {
  fs.writeFileSync(SHARED_BUFFER_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export class SharedBuffer {
  private readonly scenarioStore = new Map<string, StoredEntry>();

  async set(key: string, value: unknown, options: SetOptions = {}): Promise<void> {
    const scope = options.scope || 'scenario';
    const entry: StoredEntry = {
      value,
      expiresAt: options.ttlMs ? Date.now() + options.ttlMs : undefined,
    };

    if (scope === 'scenario') {
      this.scenarioStore.set(key, entry);
      return;
    }
    if (scope === 'worker') {
      workerStore.set(key, entry);
      return;
    }

    await withFileLock(() => {
      const store = readFileStore();
      store[key] = entry;
      writeFileStore(store);
    });

    if (env.dbEnabled) {
      await upsertSharedKv(key, value, entry.expiresAt);
    }
  }

  async get<T = unknown>(key: string, scope: BufferScope = 'scenario'): Promise<T | undefined> {
    if (scope === 'scenario') return unwrap<T>(this.scenarioStore.get(key));
    if (scope === 'worker') return unwrap<T>(workerStore.get(key));

    if (env.dbEnabled) {
      const fromDb = await getSharedKv<T>(key);
      if (fromDb !== undefined && fromDb !== null) return fromDb;
    }

    return withFileLock(() => unwrap<T>(readFileStore()[key]));
  }

  async delete(key: string, scope: BufferScope = 'scenario'): Promise<void> {
    if (scope === 'scenario') {
      this.scenarioStore.delete(key);
      return;
    }
    if (scope === 'worker') {
      workerStore.delete(key);
      return;
    }

    await withFileLock(() => {
      const store = readFileStore();
      delete store[key];
      writeFileStore(store);
    });

    if (env.dbEnabled) {
      await deleteSharedKv(key);
    }
  }

  async getAll(scope: BufferScope = 'scenario'): Promise<Record<string, unknown>> {
    const toObject = (map: Map<string, StoredEntry>): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of map.entries()) {
        const value = unwrap(entry);
        if (value !== undefined) result[key] = value;
      }
      return result;
    };

    if (scope === 'scenario') return toObject(this.scenarioStore);
    if (scope === 'worker') return toObject(workerStore);

    return withFileLock(() => {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(readFileStore())) {
        const value = unwrap(entry);
        if (value !== undefined) result[key] = value;
      }
      return result;
    });
  }

  clearScenario(): void {
    this.scenarioStore.clear();
  }
}
