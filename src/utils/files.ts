import fs from 'fs';
import path from 'path';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function sanitizeFileName(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 120);
}

/** Wait until a just-written file is visible and readable (OneDrive / AV can lag). */
export async function waitForReadableFile(filePath: string, timeoutMs = 15000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        const fd = fs.openSync(filePath, 'r');
        fs.closeSync(fd);
        return true;
      }
    } catch {
      // File is still being flushed or briefly locked.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}
