export type ActivityStatus = 'pass' | 'fail' | 'skip' | 'info' | 'warn';
export type ActivityCategory = 'step' | 'action' | 'assert' | 'log' | 'hook';

export interface ExtentActivity {
  id: string;
  timestamp: string;
  status: ActivityStatus;
  category: ActivityCategory;
  name: string;
  action?: string;
  details?: string;
  locator?: string;
  url?: string;
  durationMs?: number;
  error?: string;
  screenshot?: string;
}

export interface ExtentStep {
  id: string;
  keyword: string;
  name: string;
  status: ActivityStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  activities: ExtentActivity[];
}

export interface ExtentTest {
  id: string;
  runId: string;
  name: string;
  feature: string;
  featureFile?: string;
  tags: string[];
  status: 'passed' | 'failed' | 'skipped';
  browser: string;
  environment: string;
  workerId?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  screenshot?: string;
  video?: string;
  trace?: string;
  insight?: {
    likelyCause?: string;
    category?: string;
    suggestedFix?: string;
    confidence?: string;
    model?: string;
  };
  steps: ExtentStep[];
}

export interface ExtentEnvironment {
  browser: string;
  headed: boolean;
  baseUrl: string;
  executionEnv: string;
  os: string;
  node: string;
  parallel: number;
  runName: string;
  runId: string;
}

export interface ExtentRun {
  id: string;
  name: string;
  startedAt: string;
  finishedAt: string;
  environment: ExtentEnvironment;
  tests: ExtentTest[];
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  activityCount: number;
  failedActivityCount: number;
}
