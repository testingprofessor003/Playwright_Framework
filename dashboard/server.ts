import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from '../src/config/env';
import { logger } from '../src/logger/logger';
import {
  getRun,
  getTrends,
  listFailures,
  listInsights,
  listRuns,
  listScenarios,
} from '../src/db/repository';
import {
  loadRun,
  loadRunIndex,
  listHistoryFailures,
  HistoryRun,
} from '../src/reports/historyStore';
import { isLlmReachable } from '../src/ai/llmClient';
import { runTriage } from '../src/ai/runTriage';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/screenshots', express.static(path.join(process.cwd(), 'reports', 'screenshots')));

function fromHistory(): HistoryRun[] {
  return loadRunIndex()
    .map((r) => loadRun(r.id))
    .filter((r): r is HistoryRun => Boolean(r));
}

app.get('/api/health', async (_req, res) => {
  const llmReachable = env.llmEnabled ? await isLlmReachable() : false;
  res.json({
    ok: true,
    db: env.dbEnabled,
    llm: env.llmEnabled,
    llmReachable,
    llmHost: env.llmHost,
    llmModel: env.llmModel,
    ollama: env.llmEnabled,
  });
});

app.get('/api/runs', async (_req, res) => {
  const dbRuns = await listRuns();
  if (dbRuns.length) {
    res.json(dbRuns);
    return;
  }
  res.json(fromHistory());
});

app.get('/api/runs/:id', async (req, res) => {
  const dbRun = await getRun(req.params.id);
  const scenarios = await listScenarios(req.params.id);
  if (dbRun) {
    res.json({ ...dbRun, scenarios });
    return;
  }
  const history = loadRun(req.params.id);
  if (!history) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  res.json(history);
});

app.get('/api/failures', async (req, res) => {
  const runId = typeof req.query.runId === 'string' ? req.query.runId : undefined;
  const dbFailures = await listFailures(runId);
  if (dbFailures.length) {
    res.json(dbFailures);
    return;
  }
  res.json(listHistoryFailures(runId));
});

app.get('/api/trends', async (_req, res) => {
  const dbTrends = await getTrends();
  if (dbTrends.length) {
    res.json(dbTrends);
    return;
  }
  res.json(
    fromHistory().map((r) => ({
      id: r.id,
      started_at: r.startedAt,
      total: r.total,
      passed: r.passed,
      failed: r.failed,
      skipped: r.skipped,
      duration_ms: r.durationMs,
      status: r.status,
      browser: r.browser,
    })),
  );
});

app.get('/api/insights', async (req, res) => {
  const runId = typeof req.query.runId === 'string' ? req.query.runId : undefined;
  const dbInsights = await listInsights(runId);
  if (dbInsights.length) {
    res.json(dbInsights);
    return;
  }
  const run = runId ? loadRun(runId) : fromHistory()[0];
  res.json(run?.insights || []);
});

app.post('/api/triage', async (req, res) => {
  const runId = req.body?.runId as string | undefined;
  await runTriage(runId);
  res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = env.dashboardPort;
app.listen(port, () => {
  logger.info(`Historical dashboard listening on http://localhost:${port}`);
});
