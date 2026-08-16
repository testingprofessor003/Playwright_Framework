import {
  After,
  AfterAll,
  AfterStep,
  Before,
  BeforeAll,
  BeforeStep,
  ITestCaseHookParameter,
  setDefaultTimeout,
  Status,
} from '@cucumber/cucumber';
import { Browser } from 'playwright';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { CustomWorld } from '../world/CustomWorld';
import { env } from '../config/env';
import { launchLocalBrowser, resolveBrowserName, getContextOptions, maximizeWindow } from '../config/browsers';
import { connectBrowserStack } from '../config/browserstack';
import { getOrCreateRunId, getWorkerId } from '../config/runContext';
import { PlaywrightActions } from '../utils/PlaywrightActions';
import { SCREENSHOTS_DIR, STEP_SCREENSHOTS_DIR, TRACES_DIR, VIDEOS_DIR, ALLURE_RESULTS_DIR } from '../config/paths';
import { shouldKeepArtifact, shouldRecordArtifact } from '../config/artifacts';
import { sanitizeFileName } from '../utils/files';
import { buildRunName, stamp } from '../utils/dates';
import { mapPlaywrightError } from '../errors/mapPlaywrightError';
import { FrameworkError } from '../errors/errors';
import { ensureRun, finalizeRun, saveFailure, saveScenario } from '../db/repository';
import { appendScenario, upsertHistoryRun } from '../reports/historyStore';
import { logger } from '../logger/logger';
import { closeDb } from '../db/adapter';
import { beginScenarioReporter, endScenarioReporter, getActivityReporter, resetExtentData } from '../reports/extent/ActivityReporter';
import { generateCustomFailureReport } from '../reports/customFailureReport';
import { runTriage } from '../ai/runTriage';

setDefaultTimeout(Number(process.env.CUCUMBER_TIMEOUT || 60000));

function toDurationMs(result: ITestCaseHookParameter['result'], startedAt: number): number {
  const duration = result?.duration as { seconds?: number; nanos?: number } | number | undefined;
  if (typeof duration === 'number') return duration;
  if (duration && (duration.seconds !== undefined || duration.nanos !== undefined)) {
    return Number(duration.seconds || 0) * 1000 + Number(duration.nanos || 0) / 1e6;
  }
  return Date.now() - startedAt;
}

let workerBrowser: Browser | undefined;

function pickleName(pickle: ITestCaseHookParameter['pickle']): string {
  return pickle.name;
}

function pickleTags(pickle: ITestCaseHookParameter['pickle']): string[] {
  return pickle.tags.map((tag) => tag.name);
}

function featureTitle(scenario: ITestCaseHookParameter): string {
  return scenario.gherkinDocument?.feature?.name || scenario.pickle.uri || 'Unknown feature';
}

function stepKeyword(pickleStep: { type?: string | number }): string {
  const type = String(pickleStep.type ?? '').toUpperCase();
  if (type.includes('CONTEXT') || type === '1') return 'Given';
  if (type.includes('ACTION') || type === '2') return 'When';
  if (type.includes('OUTCOME') || type === '3') return 'Then';
  return '';
}

/** Move Playwright's temp webm into recordings/test-runs with a readable scenario name. */
async function persistScenarioVideo(sourcePath: string, scenarioName: string, scenarioId: string): Promise<string> {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  const target = path.join(
    VIDEOS_DIR,
    `${sanitizeFileName(scenarioName)}-${scenarioId.slice(0, 8)}.webm`,
  );
  if (path.resolve(sourcePath) === path.resolve(target)) {
    return target;
  }
  try {
    fs.renameSync(sourcePath, target);
  } catch {
    fs.copyFileSync(sourcePath, target);
    fs.unlinkSync(sourcePath);
  }
  return target;
}

BeforeAll(async function () {
  const runId = await getOrCreateRunId();
  const runName = env.runName || buildRunName(env.browser, env.executionEnv);
  const categoriesSrc = path.join(process.cwd(), 'src', 'reports', 'allure-categories.json');
  if (fs.existsSync(categoriesSrc)) {
    fs.copyFileSync(categoriesSrc, path.join(ALLURE_RESULTS_DIR, 'categories.json'));
  }
  await upsertHistoryRun({
    id: runId,
    name: runName,
    startedAt: new Date().toISOString(),
    browser: env.browser,
    environment: env.executionEnv,
    status: 'running',
  });
  await ensureRun({
    id: runId,
    started_at: new Date().toISOString(),
    browser: env.browser,
    environment: env.executionEnv,
    status: 'running',
  });
  logger.info(`Worker ${getWorkerId()} starting ${runName} [${runId}] on ${env.browser} (${env.executionEnv}, ${env.headless ? 'headless' : 'headed'})`);
  await resetExtentData(runId, runName);

  if (env.executionEnv !== 'browserstack') {
    try {
      workerBrowser = await launchLocalBrowser(resolveBrowserName());
    } catch (error) {
      throw mapPlaywrightError(error, { action: 'launchBrowser' });
    }
  }
});

Before(async function (this: CustomWorld, scenario: ITestCaseHookParameter) {
  this.runId = await getOrCreateRunId();
  this.workerId = getWorkerId();
  this.scenarioId = randomUUID();
  this.scenarioName = pickleName(scenario.pickle);
  this.featureName = featureTitle(scenario);
  this.tags = pickleTags(scenario.pickle);
  this.startedAt = Date.now();
  this.stepIndex = 0;
  this.browserName = env.browser;
  this.initLogger();
  this.shared.clearScenario();
  beginScenarioReporter({
    id: this.scenarioId,
    runId: this.runId,
    name: this.scenarioName,
    feature: this.featureName,
    featureFile: scenario.pickle.uri,
    tags: this.tags,
    browser: this.browserName,
    environment: env.executionEnv,
    workerId: this.workerId,
  });
  this.logger.info(`Starting scenario: ${this.scenarioName}`);

  try {
    if (env.executionEnv === 'browserstack') {
      this.browser = await connectBrowserStack(this.scenarioName);
    } else {
      this.browser = workerBrowser!;
    }

    const recordVideo = shouldRecordArtifact(env.video) ? { dir: VIDEOS_DIR } : undefined;

    this.context = await this.browser.newContext({
      ...getContextOptions(),
      recordVideo,
    });
    this.context.setDefaultTimeout(env.defaultTimeout);
    this.context.setDefaultNavigationTimeout(env.navigationTimeout);
    this.page = await this.context.newPage();
    this.actions = new PlaywrightActions(this.page, this.logger, this.context);
    await maximizeWindow(this.page, this.context);

    if (shouldRecordArtifact(env.trace)) {
      await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    }
  } catch (error) {
    throw mapPlaywrightError(error, { action: 'beforeScenario' });
  }
});

BeforeStep(async function (this: CustomWorld, { pickleStep }) {
  this.stepIndex += 1;
  getActivityReporter()?.startStep(pickleStep.text, stepKeyword(pickleStep));
  this.logger.info(`STEP → ${pickleStep.text}`);
});

AfterStep(async function (this: CustomWorld, { pickleStep, result }) {
  const status = result?.status || 'UNKNOWN';
  const failed = status === Status.FAILED;
  if (failed) {
    const detail =
      (result as { message?: string; exception?: { message?: string } } | undefined)?.message ||
      (result as { exception?: { message?: string } } | undefined)?.exception?.message ||
      pickleStep.text;
    getActivityReporter()?.logFailure(pickleStep.text, String(detail));
    this.logger.error(`STEP FAILED ← ${pickleStep.text}`);
  }

  await captureStepScreenshot(this, pickleStep.text, failed, status === Status.PASSED || failed);

  if (failed) {
    getActivityReporter()?.endStep('fail');
  } else if (status === Status.SKIPPED || status === Status.PENDING || status === Status.UNDEFINED) {
    getActivityReporter()?.endStep('skip');
    this.logger.debug(`STEP ${status} ← ${pickleStep.text}`);
  } else {
    getActivityReporter()?.endStep('pass');
    this.logger.debug(`STEP ${status} ← ${pickleStep.text}`);
  }
});

After(async function (this: CustomWorld, scenario: ITestCaseHookParameter) {
  const statusName = scenario.result?.status || Status.PASSED;
  const failed = statusName === Status.FAILED;
  const skipped = statusName === Status.SKIPPED || statusName === Status.PENDING;
  const status = failed ? 'failed' : skipped ? 'skipped' : 'passed';
  const durationMs = toDurationMs(scenario.result, this.startedAt);
  getActivityReporter()?.startStep('Teardown', 'Hook');

  let mapped: FrameworkError | undefined;
  if (failed) {
    const exception =
      (scenario.result as { exception?: { message?: string } } | undefined)?.exception?.message ||
      scenario.result?.message ||
      this.lastError;
    mapped = mapPlaywrightError(exception, { action: 'scenario', url: this.page?.url?.() });
    this.logger.error(`Scenario failed: ${mapped.code} ${mapped.message}`, mapped.toJSON());
  }

  try {
    if (this.page && !this.page.isClosed() && shouldKeepArtifact(env.screenshot, failed)) {
      const fileBase = `${sanitizeFileName(this.scenarioName)}_${stamp()}`;
      const screenshotFile = path.join(SCREENSHOTS_DIR, `${fileBase}.png`);
      const buffer = await this.page.screenshot({ fullPage: env.screenshotFullPage, path: screenshotFile });
      this.screenshotPath = screenshotFile;
      await this.attach(buffer, 'image/png');
      if (failed) {
        const logDump = JSON.stringify(mapped?.toJSON() || { status }, null, 2);
        await this.attach(logDump, 'application/json');
      }
    }

    if (this.context && shouldRecordArtifact(env.trace)) {
      if (shouldKeepArtifact(env.trace, failed)) {
        const traceFile = path.join(TRACES_DIR, `${sanitizeFileName(this.scenarioName)}_${stamp()}.zip`);
        await this.context.tracing.stop({ path: traceFile });
        this.tracePath = traceFile;
        if (fs.existsSync(traceFile)) {
          await this.attach(fs.readFileSync(traceFile), 'application/zip');
        }
      } else {
        await this.context.tracing.stop();
      }
    }
  } catch (error) {
    this.logger.warn(`Artifact capture failed: ${error instanceof Error ? error.message : error}`);
  }

  try {
    if (env.keepBrowserOpen) {
      this.logger.info('KEEP_BROWSER_OPEN=true — leaving the browser window open after this scenario');
    } else {
      const video = this.page?.video();
      await this.page?.close();
      await this.context?.close();
      if (video) {
        if (shouldKeepArtifact(env.video, failed)) {
          const rawPath = await video.path();
          if (rawPath && fs.existsSync(rawPath)) {
            this.videoPath = await persistScenarioVideo(rawPath, this.scenarioName, this.scenarioId);
            await this.attach(fs.readFileSync(this.videoPath), 'video/webm');
            this.logger.info(`Scenario video saved: ${this.videoPath}`);
          }
        } else {
          await video.delete();
          this.videoPath = undefined;
        }
      }
      if (env.executionEnv === 'browserstack') {
        await this.browser?.close();
      }
    }
  } catch (error) {
    this.logger.warn(`Teardown warning: ${error instanceof Error ? error.message : error}`);
  }

  const scenarioRecord = {
    id: this.scenarioId,
    runId: this.runId,
    name: this.scenarioName,
    feature: this.featureName,
    tags: this.tags,
    status,
    durationMs: Math.round(durationMs),
    browser: this.browserName,
    startedAt: new Date(this.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    screenshotPath: this.screenshotPath,
    videoPath: this.videoPath,
    tracePath: this.tracePath,
    errorCode: mapped?.code,
    errorCategory: mapped?.category,
    errorMessage: mapped?.message,
    stack: mapped?.stack,
    locator: mapped?.locator,
    url: mapped?.url,
  };

  try {
    appendScenario(this.runId, scenarioRecord);
    await saveScenario(scenarioRecord);
    if (failed && mapped) {
      await saveFailure({
        runId: this.runId,
        scenarioId: this.scenarioId,
        errorCode: mapped.code,
        errorCategory: mapped.category,
        errorMessage: mapped.message,
        stack: mapped.stack,
        locator: mapped.locator,
        url: mapped.url,
        screenshotPath: this.screenshotPath,
      });
    }
    this.logger.info(`Finished scenario [${status}] in ${Math.round(durationMs)}ms`);
  } finally {
    endScenarioReporter(status, mapped?.message, {
      screenshot: this.screenshotPath,
      video: this.videoPath,
      trace: this.tracePath,
    });
  }
});

AfterAll(async function () {
  try {
    if (env.keepBrowserOpen && !process.env.CI) {
      await pauseWithBrowserOpen();
    }
    if (workerBrowser && !env.keepBrowserOpen) {
      await workerBrowser.close();
      workerBrowser = undefined;
    }
    const runId = await getOrCreateRunId();
    await finalizeRun(runId);
    const isPrimaryWorker = !process.env.CUCUMBER_WORKER_ID || process.env.CUCUMBER_WORKER_ID === '0';
    if (isPrimaryWorker) {
      try {
        if (env.llmEnabled) {
          await runTriage(runId);
        } else {
          generateCustomFailureReport(runId);
        }
      } catch (error) {
        logger.warn(`Post-run reports/triage: ${error instanceof Error ? error.message : error}`);
      }
    }
    try {
      const { generateExtentReport } = require('../reports/extent/generateExtentReport');
      generateExtentReport();
    } catch (error) {
      logger.warn(`Extent report generation: ${error instanceof Error ? error.message : error}`);
    }
  } catch (error) {
    logger.warn(`AfterAll cleanup: ${error instanceof Error ? error.message : error}`);
  } finally {
    if (!env.keepBrowserOpen) {
      await closeDb();
    }
  }
});

async function captureStepScreenshot(
  world: CustomWorld,
  stepText: string,
  failed: boolean,
  eligible: boolean,
): Promise<void> {
  if (!eligible || !shouldKeepArtifact(env.stepScreenshot, failed)) return;
  if (!world.page || world.page.isClosed()) return;
  try {
    fs.mkdirSync(STEP_SCREENSHOTS_DIR, { recursive: true });
    const file = path.join(
      STEP_SCREENSHOTS_DIR,
      `${sanitizeFileName(world.scenarioName)}_${world.scenarioId.slice(0, 8)}_${String(world.stepIndex).padStart(2, '0')}_${stamp()}.png`,
    );
    const buffer = await world.page.screenshot({ fullPage: env.screenshotFullPage, path: file });
    getActivityReporter()?.attachScreenshot(file, `Screenshot after: ${stepText}`);
    await world.attach(buffer, 'image/png');
  } catch (error) {
    world.logger.warn(`Step screenshot failed: ${error instanceof Error ? error.message : error}`);
  }
}

async function pauseWithBrowserOpen(): Promise<void> {
  if (env.keepBrowserOpenMs > 0) {
    logger.info(
      `KEEP_BROWSER_OPEN=true — browser will stay open for ${env.keepBrowserOpenMs}ms. Close it manually or wait.`,
    );
    await new Promise((resolve) => setTimeout(resolve, env.keepBrowserOpenMs));
    return;
  }

  logger.info('KEEP_BROWSER_OPEN=true — browser will stay open. Press Enter in this terminal to exit.');
  await new Promise<void>((resolve) => {
    const onData = (): void => {
      process.stdin.off('data', onData);
      resolve();
    };
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
    process.stdin.once('data', onData);
  });
}
