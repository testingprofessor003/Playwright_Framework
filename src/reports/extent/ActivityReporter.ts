import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { lock } from 'proper-lockfile';
import { EXTENT_DATA_DIR, EXTENT_REPORT_DIR, ensureDirs } from '../../config/paths';
import { nowIso } from '../../utils/dates';
import { ActivityStatus, ExtentActivity, ExtentStep, ExtentTest } from './types';

let current: ActivityReporter | undefined;
let suppressWinston = 0;

export function getActivityReporter(): ActivityReporter | undefined {
  return current;
}

export function isWinstonSuppressed(): boolean {
  return suppressWinston > 0;
}

export async function withSuppressedWinston<T>(fn: () => Promise<T>): Promise<T> {
  suppressWinston += 1;
  try {
    return await fn();
  } finally {
    suppressWinston -= 1;
  }
}

export interface StartTestMeta {
  id: string;
  runId: string;
  name: string;
  feature: string;
  featureFile?: string;
  tags: string[];
  browser: string;
  environment: string;
  workerId?: string;
}

export class ActivityReporter {
  private readonly test: ExtentTest;
  private currentStep?: ExtentStep;

  constructor(meta: StartTestMeta) {
    this.test = {
      id: meta.id,
      runId: meta.runId,
      name: meta.name,
      feature: meta.feature,
      featureFile: meta.featureFile,
      tags: meta.tags,
      status: 'passed',
      browser: meta.browser,
      environment: meta.environment,
      workerId: meta.workerId,
      startedAt: nowIso(),
      steps: [],
    };
    this.startStep('Setup', 'Hook');
  }

  startStep(name: string, keyword = ''): void {
    this.closeCurrentStep('pass');
    this.currentStep = {
      id: randomUUID(),
      keyword,
      name,
      status: 'info',
      startedAt: nowIso(),
      activities: [],
    };
    this.test.steps.push(this.currentStep);
  }

  endStep(status: ActivityStatus): void {
    this.closeCurrentStep(status);
  }

  logAction(input: {
    action: string;
    locator?: string;
    url?: string;
    status: ActivityStatus;
    durationMs?: number;
    error?: string;
    details?: string;
    screenshot?: string;
  }): void {
    const prettyAction = input.action.charAt(0).toUpperCase() + input.action.slice(1);
    const name = input.locator ? `${prettyAction}: ${input.locator}` : prettyAction;
    this.pushActivity({
      category: input.action.toLowerCase().startsWith('assert') ? 'assert' : 'action',
      name,
      action: input.action,
      locator: input.locator,
      url: input.url,
      status: input.status,
      durationMs: input.durationMs,
      error: input.error,
      details: input.details,
      screenshot: input.screenshot,
    });
  }

  logFailure(stepName: string, error?: string): void {
    this.pushActivity({
      category: 'assert',
      name: `Step failed: ${stepName}`,
      error: error || 'Step failed',
      status: 'fail',
    });
  }

  attachScreenshot(filePath: string, name = 'Screenshot'): void {
    this.pushActivity({
      category: 'log',
      name,
      screenshot: filePath,
      status: 'info',
    });
  }

  logMessage(level: string, message: string, details?: string): void {
    const text = String(message || '').trim();
    if (!text) return;
    if (text.startsWith('STEP →') || text.startsWith('STEP FAILED') || /^STEP [A-Z]+ ←/.test(text)) {
      return;
    }
    this.pushActivity({
      category: 'log',
      name: text,
      details,
      status: levelToStatus(level),
    });
  }

  finish(
    status: ExtentTest['status'],
    error?: string,
    artifacts?: { screenshot?: string; video?: string; trace?: string },
  ): ExtentTest {
    this.closeCurrentStep(status === 'failed' ? 'fail' : status === 'skipped' ? 'skip' : 'pass');
    this.test.status = status;
    this.test.finishedAt = nowIso();
    this.test.durationMs = Math.max(
      0,
      new Date(this.test.finishedAt).getTime() - new Date(this.test.startedAt).getTime(),
    );
    if (error) this.test.error = error;
    if (artifacts?.screenshot) this.test.screenshot = artifacts.screenshot;
    if (artifacts?.video) this.test.video = artifacts.video;
    if (artifacts?.trace) this.test.trace = artifacts.trace;
    return this.test;
  }

  flush(): string {
    ensureDirs();
    fs.mkdirSync(EXTENT_DATA_DIR, { recursive: true });
    const file = path.join(EXTENT_DATA_DIR, `${this.test.id}.json`);
    fs.writeFileSync(file, JSON.stringify(this.test, null, 2), 'utf8');
    return file;
  }

  private ensureStep(): ExtentStep {
    if (!this.currentStep) {
      this.startStep('Framework', 'Hook');
    }
    return this.currentStep!;
  }

  private closeCurrentStep(status: ActivityStatus): void {
    if (!this.currentStep) return;
    const failed = this.currentStep.activities.some((activity) => activity.status === 'fail');
    this.currentStep.status = failed ? 'fail' : status;
    this.currentStep.finishedAt = nowIso();
    this.currentStep.durationMs = Math.max(
      0,
      new Date(this.currentStep.finishedAt).getTime() - new Date(this.currentStep.startedAt).getTime(),
    );
    this.currentStep = undefined;
  }

  private pushActivity(partial: Omit<ExtentActivity, 'id' | 'timestamp'>): void {
    const step = this.ensureStep();
    const activity: ExtentActivity = {
      id: randomUUID(),
      timestamp: nowIso(),
      ...partial,
    };
    step.activities.push(activity);
    if (activity.status === 'fail') {
      step.status = 'fail';
    }
  }
}

export function beginScenarioReporter(meta: StartTestMeta): ActivityReporter {
  current = new ActivityReporter(meta);
  return current;
}

export function endScenarioReporter(
  status: ExtentTest['status'],
  error?: string,
  artifacts?: { screenshot?: string; video?: string; trace?: string },
): string | undefined {
  if (!current) return undefined;
  current.finish(status, error, artifacts);
  const file = current.flush();
  current = undefined;
  return file;
}

function levelToStatus(level: string): ActivityStatus {
  const normalized = level.replace(/\u001b\[[0-9;]*m/g, '').toLowerCase();
  if (normalized.includes('error')) return 'fail';
  if (normalized.includes('warn')) return 'warn';
  if (normalized.includes('debug')) return 'info';
  return 'info';
}

export async function resetExtentData(runId: string, runName: string): Promise<void> {
  ensureDirs();
  fs.mkdirSync(EXTENT_REPORT_DIR, { recursive: true });
  const marker = path.join(EXTENT_REPORT_DIR, '.run-marker');
  if (!fs.existsSync(marker)) {
    fs.writeFileSync(marker, '', 'utf8');
  }
  const release = await lock(marker, { retries: { retries: 20, minTimeout: 20 } });
  try {
    const previous = fs.readFileSync(marker, 'utf8').trim();
    if (previous === runId) return;
    if (fs.existsSync(EXTENT_DATA_DIR)) {
      for (const file of fs.readdirSync(EXTENT_DATA_DIR)) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(EXTENT_DATA_DIR, file));
        }
      }
    }
    fs.writeFileSync(
      path.join(EXTENT_REPORT_DIR, 'run-meta.json'),
      JSON.stringify({ id: runId, name: runName, startedAt: nowIso() }, null, 2),
      'utf8',
    );
    fs.writeFileSync(marker, runId, 'utf8');
  } finally {
    await release();
  }
}
