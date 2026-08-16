import path from 'path';
import { HISTORY_DIR } from '../config/paths';
import { readJson, writeJson } from '../utils/files';
import { buildRunName, nowIso } from '../utils/dates';

export interface HistoryRun {
  id: string;
  name?: string;
  startedAt: string;
  finishedAt?: string;
  browser?: string;
  environment?: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  status: string;
  scenarios: HistoryScenario[];
  insights?: HistoryInsight[];
}

export interface HistoryScenario {
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
  errorCode?: string;
  errorCategory?: string;
  errorMessage?: string;
  stack?: string;
  locator?: string;
  url?: string;
}

export interface HistoryInsight {
  id?: string;
  runId: string;
  scenarioId?: string;
  likelyCause?: string;
  category?: string;
  suggestedFix?: string;
  confidence?: string;
  rawResponse?: string;
  model?: string;
  createdAt?: string;
}

const RUNS_INDEX = path.join(HISTORY_DIR, 'runs.json');

function runFile(runId: string): string {
  return path.join(HISTORY_DIR, `${runId}.json`);
}

export function loadRunIndex(): HistoryRun[] {
  return readJson<HistoryRun[]>(RUNS_INDEX, []);
}

export function loadRun(runId: string): HistoryRun | undefined {
  return readJson<HistoryRun | undefined>(runFile(runId), undefined);
}

export function upsertHistoryRun(partial: Partial<HistoryRun> & { id: string }): HistoryRun {
  const current = loadRun(partial.id) || {
    id: partial.id,
    name: partial.name,
    startedAt: partial.startedAt || nowIso(),
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    status: 'running',
    scenarios: [],
    insights: [],
  };
  const merged: HistoryRun = { ...current, ...partial, scenarios: partial.scenarios || current.scenarios };
  writeJson(runFile(merged.id), merged);
  const index = loadRunIndex().filter((r) => r.id !== merged.id);
  index.unshift({
    ...merged,
    scenarios: (merged.scenarios || []).map((scenario) => ({
      id: scenario.id,
      runId: scenario.runId,
      name: scenario.name,
      status: scenario.status,
      durationMs: scenario.durationMs,
    })),
  });
  writeJson(RUNS_INDEX, index.slice(0, 100));
  return merged;
}

export function appendScenario(runId: string, scenario: HistoryScenario): HistoryRun {
  const run = upsertHistoryRun({ id: runId });
  const scenarios = run.scenarios.filter((s) => s.id !== scenario.id);
  scenarios.push(scenario);
  const total = scenarios.length;
  const passed = scenarios.filter((s) => s.status === 'passed').length;
  const failed = scenarios.filter((s) => s.status === 'failed').length;
  const skipped = scenarios.filter((s) => s.status === 'skipped').length;
  const durationMs = scenarios.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  const name = buildRunName(
    run.browser || scenario.browser || 'chrome',
    run.environment || 'local',
    new Date(run.startedAt),
    scenarios.map((item) => item.name),
  );
  return upsertHistoryRun({
    id: runId,
    name,
    scenarios,
    total,
    passed,
    failed,
    skipped,
    durationMs,
    status: failed ? 'failed' : 'passed',
    finishedAt: nowIso(),
  });
}

export function appendInsight(runId: string, insight: HistoryInsight): void {
  const run = loadRun(runId) || upsertHistoryRun({ id: runId });
  const insights = [...(run.insights || []), { ...insight, createdAt: insight.createdAt || nowIso() }];
  upsertHistoryRun({ id: runId, insights, scenarios: run.scenarios });
}

export function listHistoryFailures(runId?: string): HistoryScenario[] {
  if (runId) {
    return (loadRun(runId)?.scenarios || []).filter((s) => s.status === 'failed');
  }
  return loadRunIndex()
    .map((summary) => loadRun(summary.id))
    .filter((run): run is HistoryRun => Boolean(run))
    .flatMap((run) => run.scenarios.filter((s) => s.status === 'failed'));
}
