import dotenv from 'dotenv';
import path from 'path';
import { parseArtifactMode } from './artifacts';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export type ExecutionEnv = 'local' | 'browserstack';
export type DbType = 'mysql' | 'postgres';
export type LlmApiMode = 'auto' | 'ollama' | 'openai';

function hostUrl(value: string | undefined, fallback: string): string {
  const raw = (value || fallback).trim();
  if (!raw) return fallback;
  return /^https?:\/\//i.test(raw) ? raw.replace(/\/$/, '') : `http://${raw.replace(/\/$/, '')}`;
}

function llmApiMode(value: string | undefined): LlmApiMode {
  const normalized = (value || 'auto').trim().toLowerCase();
  if (normalized === 'ollama' || normalized === 'openai' || normalized === 'auto') return normalized;
  return 'auto';
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  baseUrl: process.env.BASE_URL || 'https://corebanking.testingprofessor.net/',
  browser: (process.env.BROWSER || 'chrome').toLowerCase() as BrowserName,
  browserChannel: (process.env.BROWSER_CHANNEL || '').toLowerCase(),
  headless: bool(process.env.HEADLESS, false) && !bool(process.env.KEEP_BROWSER_OPEN, false),
  keepBrowserOpen: bool(process.env.KEEP_BROWSER_OPEN, false),
  keepBrowserOpenMs: num(process.env.KEEP_BROWSER_OPEN_MS, 0),
  loginPauseMs: num(process.env.LOGIN_PAUSE_MS, 3000),
  clickPauseMs: num(process.env.CLICK_PAUSE_MS, 800),
  slowMo: num(process.env.SLOW_MO, 0),
  parallel: num(process.env.PARALLEL, 1),
  retry: num(process.env.RETRY, 0),
  screenshot: parseArtifactMode(process.env.SCREENSHOT, 'retain-on-failure'),
  stepScreenshot: parseArtifactMode(process.env.STEP_SCREENSHOT, 'off'),
  screenshotFullPage: bool(process.env.SCREENSHOT_FULL_PAGE, true),
  trace: parseArtifactMode(process.env.TRACE, 'off'),
  video: parseArtifactMode(process.env.VIDEO, 'retain-on-failure'),
  viewportWidth: num(process.env.VIEWPORT_WIDTH, 1280),
  viewportHeight: num(process.env.VIEWPORT_HEIGHT, 720),
  defaultTimeout: num(process.env.DEFAULT_TIMEOUT, 30000),
  navigationTimeout: num(process.env.NAVIGATION_TIMEOUT, 30000),
  logLevel: process.env.LOG_LEVEL || 'info',
  executionEnv: (process.env.EXECUTION_ENV || 'local').toLowerCase() as ExecutionEnv,
  dbEnabled: bool(process.env.DB_ENABLED, false),
  dbType: (process.env.DB_TYPE || 'mysql').toLowerCase() as DbType,
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: num(process.env.DB_PORT, process.env.DB_TYPE === 'postgres' ? 5432 : 3306),
  dbUser: process.env.DB_USER || 'root',
  dbPassword: process.env.DB_PASSWORD || 'password',
  dbName: process.env.DB_NAME || 'playwright_framework',
  llmEnabled: bool(process.env.LLM_ENABLED ?? process.env.OLLAMA_ENABLED, false),
  llmHost: hostUrl(
    process.env.LLM_HOST || process.env.OLLAMA_HOST,
    'http://localaiserver.testingprofessor.net',
  ),
  llmModel: process.env.LLM_MODEL || process.env.OLLAMA_MODEL || 'auto',
  llmRouterModel: process.env.LLM_ROUTER_MODEL || 'llama3',
  llmComplexModel: process.env.LLM_COMPLEX_MODEL || 'gemma4:latest',
  llmPreferBillion: num(process.env.LLM_PREFER_BILLION, 32),
  llmRoute: bool(process.env.LLM_ROUTE, true),
  llmApiKey: process.env.LLM_API_KEY || process.env.OLLAMA_API_KEY || process.env.OPENAI_API_KEY || '',
  llmApi: llmApiMode(process.env.LLM_API || 'ollama'),
  llmTimeoutMs: num(process.env.LLM_TIMEOUT_MS, 90000),
  /** @deprecated Use llmEnabled. Kept for older docker/compose env files. */
  ollamaEnabled: bool(process.env.LLM_ENABLED ?? process.env.OLLAMA_ENABLED, false),
  ollamaHost: hostUrl(
    process.env.LLM_HOST || process.env.OLLAMA_HOST,
    'http://localaiserver.testingprofessor.net',
  ),
  ollamaModel: process.env.LLM_MODEL || process.env.OLLAMA_MODEL || 'auto',
  browserstackUsername: process.env.BROWSERSTACK_USERNAME || '',
  browserstackAccessKey: process.env.BROWSERSTACK_ACCESS_KEY || '',
  browserstackOs: process.env.BROWSERSTACK_OS || 'OS X',
  browserstackOsVersion: process.env.BROWSERSTACK_OS_VERSION || 'Sonoma',
  browserstackBrowser: process.env.BROWSERSTACK_BROWSER || 'chrome',
  browserstackBrowserVersion: process.env.BROWSERSTACK_BROWSER_VERSION || 'latest',
  browserstackBuildName: process.env.BROWSERSTACK_BUILD_NAME || 'playwright-bdd-framework',
  allureResultsDir: process.env.ALLURE_RESULTS_DIR || 'reports/allure-results',
  dashboardPort: num(process.env.DASHBOARD_PORT, 3000),
  runId: process.env.RUN_ID || '',
  runName: process.env.RUN_NAME || '',
  appUsername: process.env.APP_USERNAME || '',
  appPassword: process.env.APP_PASSWORD || '',
  appEncryptionKey: process.env.APP_ENCRYPTION_KEY || '',
};

export default env;
