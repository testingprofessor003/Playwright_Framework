import { randomUUID } from 'crypto';
import { tryGetDbClient, DbClient } from './adapter';
import { nowIso } from '../utils/dates';
import { logger } from '../logger/logger';

export interface RunRecord {
  id: string;
  started_at: string;
  finished_at?: string | null;
  browser?: string;
  environment?: string;
  total?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  duration_ms?: number;
  status?: string;
}

export interface ScenarioRecord {
  id: string;
  runId: string;
  name: string;
  feature?: string;
  tags?: string[];
  status: string;
  durationMs: number;
  browser?: string;
  startedAt?: string;
  finishedAt?: string;
  screenshotPath?: string;
  videoPath?: string;
  tracePath?: string;
}

export interface FailureRecord {
  runId: string;
  scenarioId: string;
  errorCode?: string;
  errorCategory?: string;
  errorMessage?: string;
  stack?: string;
  locator?: string;
  url?: string;
  screenshotPath?: string;
}

export interface InsightRecord {
  runId: string;
  scenarioId?: string;
  likelyCause?: string;
  category?: string;
  suggestedFix?: string;
  confidence?: string;
  rawResponse?: string;
}

async function withDb<T>(fn: (db: DbClient) => Promise<T>): Promise<T | null> {
  const db = await tryGetDbClient();
  if (!db) return null;
  try {
    return await fn(db);
  } catch (error) {
    logger.warn(`DB operation failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

export async function ensureRun(run: RunRecord): Promise<void> {
  await withDb(async (db) => {
    const existing = await db.query('SELECT id FROM test_runs WHERE id = ?', [run.id]);
    if (existing.length) return;
    await db.execute(
      `INSERT INTO test_runs (id, started_at, finished_at, browser, environment, total, passed, failed, skipped, duration_ms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        run.started_at,
        run.finished_at || null,
        run.browser || null,
        run.environment || null,
        run.total || 0,
        run.passed || 0,
        run.failed || 0,
        run.skipped || 0,
        run.duration_ms || 0,
        run.status || 'running',
      ],
    );
  });
}

export async function saveScenario(scenario: ScenarioRecord): Promise<void> {
  await withDb(async (db) => {
    const existing = await db.query('SELECT id FROM test_scenarios WHERE id = ?', [scenario.id]);
    const tags = JSON.stringify(scenario.tags || []);
    if (existing.length) {
      await db.execute(
        `UPDATE test_scenarios SET name=?, feature=?, tags=?, status=?, duration_ms=?, browser=?, started_at=?, finished_at=?, screenshot_path=?, video_path=?, trace_path=? WHERE id=?`,
        [
          scenario.name,
          scenario.feature || null,
          tags,
          scenario.status,
          scenario.durationMs,
          scenario.browser || null,
          scenario.startedAt || null,
          scenario.finishedAt || null,
          scenario.screenshotPath || null,
          scenario.videoPath || null,
          scenario.tracePath || null,
          scenario.id,
        ],
      );
      return;
    }
    await db.execute(
      `INSERT INTO test_scenarios (id, run_id, name, feature, tags, status, duration_ms, browser, started_at, finished_at, screenshot_path, video_path, trace_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scenario.id,
        scenario.runId,
        scenario.name,
        scenario.feature || null,
        tags,
        scenario.status,
        scenario.durationMs,
        scenario.browser || null,
        scenario.startedAt || null,
        scenario.finishedAt || null,
        scenario.screenshotPath || null,
        scenario.videoPath || null,
        scenario.tracePath || null,
      ],
    );
  });
}

export async function saveFailure(failure: FailureRecord): Promise<void> {
  await withDb(async (db) => {
    await db.execute(
      `INSERT INTO failures (id, run_id, scenario_id, error_code, error_category, error_message, stack, locator, url, screenshot_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        failure.runId,
        failure.scenarioId,
        failure.errorCode || null,
        failure.errorCategory || null,
        failure.errorMessage || null,
        failure.stack || null,
        failure.locator || null,
        failure.url || null,
        failure.screenshotPath || null,
      ],
    );
  });
}

export async function saveInsight(insight: InsightRecord): Promise<void> {
  await withDb(async (db) => {
    await db.execute(
      `INSERT INTO ai_insights (id, run_id, scenario_id, likely_cause, category, suggested_fix, confidence, raw_response, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        insight.runId,
        insight.scenarioId || null,
        insight.likelyCause || null,
        insight.category || null,
        insight.suggestedFix || null,
        insight.confidence || null,
        insight.rawResponse || null,
        nowIso(),
      ],
    );
  });
}

export async function upsertSharedKv(key: string, value: unknown, expiresAt?: number): Promise<void> {
  await withDb(async (db) => {
    const payload = JSON.stringify(value);
    const expires = expiresAt ? new Date(expiresAt).toISOString() : null;
    const updated = nowIso();
    if (db.dialect === 'postgres') {
      await db.execute(
        `INSERT INTO shared_kv (kv_key, kv_value, expires_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (kv_key) DO UPDATE SET kv_value = EXCLUDED.kv_value, expires_at = EXCLUDED.expires_at, updated_at = EXCLUDED.updated_at`,
        [key, payload, expires, updated],
      );
      return;
    }
    await db.execute(
      `REPLACE INTO shared_kv (kv_key, kv_value, expires_at, updated_at) VALUES (?, ?, ?, ?)`,
      [key, payload, expires, updated],
    );
  });
}

export async function getSharedKv<T>(key: string): Promise<T | undefined> {
  return withDb(async (db) => {
    const rows = await db.query<{ kv_value: string; expires_at: string | null }>(
      'SELECT kv_value, expires_at FROM shared_kv WHERE kv_key = ?',
      [key],
    );
    if (!rows[0]) return undefined;
    if (rows[0].expires_at && Date.now() > new Date(rows[0].expires_at).getTime()) return undefined;
    return JSON.parse(rows[0].kv_value) as T;
  }) as Promise<T | undefined>;
}

export async function deleteSharedKv(key: string): Promise<void> {
  await withDb(async (db) => {
    await db.execute('DELETE FROM shared_kv WHERE kv_key = ?', [key]);
  });
}

export async function finalizeRun(runId: string): Promise<void> {
  await withDb(async (db) => {
    const rows = await db.query<{ status: string; duration_ms: number }>(
      'SELECT status, duration_ms FROM test_scenarios WHERE run_id = ?',
      [runId],
    );
    const total = rows.length;
    const passed = rows.filter((r) => r.status === 'passed').length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    const skipped = rows.filter((r) => r.status === 'skipped').length;
    const duration = rows.reduce((sum, r) => sum + Number(r.duration_ms || 0), 0);
    await db.execute(
      `UPDATE test_runs SET finished_at=?, total=?, passed=?, failed=?, skipped=?, duration_ms=?, status=? WHERE id=?`,
      [nowIso(), total, passed, failed, skipped, duration, failed ? 'failed' : 'passed', runId],
    );
  });
}

export async function listRuns(limit = 50): Promise<Record<string, unknown>[]> {
  const result = await withDb(async (db) =>
    db.query('SELECT * FROM test_runs ORDER BY started_at DESC LIMIT ?', [limit]),
  );
  return result || [];
}

export async function getRun(runId: string): Promise<Record<string, unknown> | undefined> {
  const result = await withDb(async (db) => {
    const runs = await db.query('SELECT * FROM test_runs WHERE id = ?', [runId]);
    return runs[0];
  });
  return result || undefined;
}

export async function listScenarios(runId: string): Promise<Record<string, unknown>[]> {
  const result = await withDb(async (db) =>
    db.query('SELECT * FROM test_scenarios WHERE run_id = ? ORDER BY started_at', [runId]),
  );
  return result || [];
}

export async function listFailures(runId?: string): Promise<Record<string, unknown>[]> {
  const result = await withDb(async (db) => {
    if (runId) {
      return db.query('SELECT * FROM failures WHERE run_id = ? ORDER BY id DESC', [runId]);
    }
    return db.query('SELECT * FROM failures ORDER BY id DESC LIMIT 200');
  });
  return result || [];
}

export async function listInsights(runId?: string): Promise<Record<string, unknown>[]> {
  const result = await withDb(async (db) => {
    if (runId) {
      return db.query('SELECT * FROM ai_insights WHERE run_id = ? ORDER BY created_at DESC', [runId]);
    }
    return db.query('SELECT * FROM ai_insights ORDER BY created_at DESC LIMIT 100');
  });
  return result || [];
}

export async function getTrends(): Promise<Record<string, unknown>[]> {
  const result = await withDb(async (db) =>
    db.query(
      'SELECT id, started_at, total, passed, failed, skipped, duration_ms, status, browser FROM test_runs ORDER BY started_at DESC LIMIT 30',
    ),
  );
  return result || [];
}
