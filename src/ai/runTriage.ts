import { env } from '../config/env';
import { logger } from '../logger/logger';
import { getLlmHealth } from './llmClient';
import { triageFailure } from './FailureTriage';
import { appendInsight, loadRun, loadRunIndex, listHistoryFailures } from '../reports/historyStore';
import { saveInsight } from '../db/repository';
import { generateCustomFailureReport } from '../reports/customFailureReport';

export async function runTriage(runId?: string): Promise<void> {
  const targetRunId = runId || loadRunIndex()[0]?.id;

  if (!env.llmEnabled) {
    logger.info('LLM_ENABLED=false — skipping AI failure triage.');
    generateCustomFailureReport(targetRunId);
    return;
  }

  const health = await getLlmHealth();
  if (!health.reachable) {
    logger.warn(`LLM is not reachable at ${health.host}. ${health.error || 'Skipping triage.'}`);
    generateCustomFailureReport(targetRunId);
    return;
  }

  const failures = listHistoryFailures(targetRunId);
  if (!failures.length) {
    logger.info('No failures to triage.');
    generateCustomFailureReport(targetRunId);
    return;
  }

  const existing = new Set((loadRun(targetRunId || '')?.insights || []).map((insight) => insight.scenarioId));
  const pending = failures.filter((failure) => !existing.has(failure.id));
  if (!pending.length) {
    logger.info('All failures already have AI insights.');
    generateCustomFailureReport(targetRunId);
    return;
  }

  logger.info(
    `Triaging ${pending.length} failure(s) via ${health.provider} at ${health.host}` +
      (health.models.length ? ` · installed: ${health.models.join(', ')}` : '') +
      ((health.catalog || []).some((item) => item.parameterBillion && item.parameterBillion >= 27 && item.parameterBillion <= 40)
        ? ` · 32B-class available`
        : ''),
  );
  for (const failure of pending) {
    try {
      const insight = await triageFailure(failure);
      appendInsight(failure.runId, insight);
      await saveInsight(insight);
      logger.info(
        `Insight stored for ${failure.name}: ${insight.category} (${insight.confidence})` +
          (insight.model ? ` via ${insight.model}` : ''),
      );
    } catch (error) {
      logger.warn(`Triage skipped for ${failure.name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  generateCustomFailureReport(targetRunId);
  const run = targetRunId ? loadRun(targetRunId) : undefined;
  logger.info(`Triage complete for ${run?.id || 'latest run'}`);
}

if (require.main === module) {
  runTriage(process.env.RUN_ID).catch((error) => {
    logger.error(`Triage failed: ${error instanceof Error ? error.message : error}`);
    process.exit(0);
  });
}
