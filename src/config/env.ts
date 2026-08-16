import dotenv from 'dotenv';
import path from 'path';
import { parseArtifactMode } from './artifacts';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export type ExecutionEnv = 'local' | 'browserstack';
export type DbType = 'mysql' | 'postgres';
export type LlmApiMode = 'auto' | 'ollama' | 'openai';
export type ColorScheme = 'light' | 'dark' | 'no-preference';

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

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value.trim() !== '') return value;
  }
  return undefined;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = (value || '').trim();
  return trimmed || undefined;
}

function csv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function colorScheme(value: string | undefined): ColorScheme | undefined {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'light' || normalized === 'dark' || normalized === 'no-preference') {
    return normalized;
  }
  return undefined;
}

function extraHttpHeaders(value: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of csv(value)) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const headerValue = pair.slice(index + 1).trim();
    if (name && headerValue) headers[name] = headerValue;
  }
  return headers;
}

function optionalPositive(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** LLM_ENABLED and OLLAMA_ENABLED are the same on/off switch. */
const llmEnabled = bool(firstEnv('LLM_ENABLED', 'OLLAMA_ENABLED'), false);
const llmHost = hostUrl(
  firstEnv('LLM_HOST', 'OLLAMA_HOST'),
  'http://localaiserver.testingprofessor.net',
);
const llmModel = firstEnv('LLM_MODEL', 'OLLAMA_MODEL') || 'auto';

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
  launchTimeout: num(process.env.LAUNCH_TIMEOUT, 180000),
  maximizeWindow: bool(process.env.MAXIMIZE_WINDOW, true),
  ignoreHttpsErrors: bool(process.env.IGNORE_HTTPS_ERRORS, true),
  acceptDownloads: bool(process.env.ACCEPT_DOWNLOADS, true),
  bypassCsp: bool(process.env.BYPASS_CSP, false),
  chromiumSandbox: bool(process.env.CHROMIUM_SANDBOX, !bool(process.env.CI, false)),
  locale: process.env.LOCALE?.trim() || 'en-US',
  timezone: optional(process.env.TIMEZONE),
  colorScheme: colorScheme(process.env.COLOR_SCHEME),
  userAgent: optional(process.env.USER_AGENT),
  browserArgs: csv(process.env.BROWSER_ARGS),
  permissions: csv(process.env.PERMISSIONS),
  extraHttpHeaders: extraHttpHeaders(process.env.EXTRA_HTTP_HEADERS),
  proxyServer: optional(process.env.PROXY_SERVER),
  proxyUsername: optional(process.env.PROXY_USERNAME),
  proxyPassword: optional(process.env.PROXY_PASSWORD),
  deviceScaleFactor: optionalPositive(process.env.DEVICE_SCALE_FACTOR),
  parallel: num(process.env.PARALLEL, 1),
  retry: num(process.env.RETRY, 0),
  /** When true, failed locators try cache → heuristics → optional LLM alternatives. */
  selfHealEnabled: bool(firstEnv('SELF_HEAL_ENABLED', 'SELF_HEAL'), false),
  /** Use LLM to suggest a locator after heuristics fail (requires LLM_ENABLED + LLM_API_KEY). */
  selfHealUseLlm: bool(process.env.SELF_HEAL_USE_LLM, false),
  selfHealTimeoutMs: num(process.env.SELF_HEAL_TIMEOUT_MS, 2500),
  screenshot: parseArtifactMode(process.env.SCREENSHOT, 'retain-on-failure'),
  stepScreenshot: parseArtifactMode(process.env.STEP_SCREENSHOT, 'off'),
  /** Screenshot after every PlaywrightActions UI action (click/fill/goto/…). */
  actionScreenshot: parseArtifactMode(process.env.ACTION_SCREENSHOT, 'off'),
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
  llmEnabled,
  llmHost,
  llmModel,
  llmRouterModel: process.env.LLM_ROUTER_MODEL || 'llama3',
  llmComplexModel: process.env.LLM_COMPLEX_MODEL || 'gemma4:latest',
  llmPreferBillion: num(process.env.LLM_PREFER_BILLION, 32),
  llmRoute: bool(process.env.LLM_ROUTE, true),
  llmApiKey: firstEnv('LLM_API_KEY', 'OLLAMA_API_KEY', 'OPENAI_API_KEY') || '',
  llmApi: llmApiMode(process.env.LLM_API || 'ollama'),
  llmTimeoutMs: num(process.env.LLM_TIMEOUT_MS, 90000),
  /** Same value as llmEnabled. OLLAMA_ENABLED is an alias of LLM_ENABLED. */
  ollamaEnabled: llmEnabled,
  /** Same value as llmHost. OLLAMA_HOST is an alias of LLM_HOST. */
  ollamaHost: llmHost,
  /** Same value as llmModel. OLLAMA_MODEL is an alias of LLM_MODEL. */
  ollamaModel: llmModel,
  browserstackUsername: process.env.BROWSERSTACK_USERNAME || '',
  browserstackAccessKey: process.env.BROWSERSTACK_ACCESS_KEY || '',
  browserstackOs: process.env.BROWSERSTACK_OS || 'OS X',
  browserstackOsVersion: process.env.BROWSERSTACK_OS_VERSION || 'Sonoma',
  browserstackBrowser: process.env.BROWSERSTACK_BROWSER || 'chrome',
  browserstackBrowserVersion: process.env.BROWSERSTACK_BROWSER_VERSION || 'latest',
  browserstackBuildName: process.env.BROWSERSTACK_BUILD_NAME || 'playwright-bdd-framework',
  browserstackProjectName: process.env.BROWSERSTACK_PROJECT_NAME || 'Playwright BDD Cucumber',
  browserstackResolution: process.env.BROWSERSTACK_RESOLUTION || `${num(process.env.VIEWPORT_WIDTH, 1280)}x${num(process.env.VIEWPORT_HEIGHT, 720)}`,
  browserstackLocal: bool(process.env.BROWSERSTACK_LOCAL, false),
  browserstackVideo: bool(process.env.BROWSERSTACK_VIDEO, true),
  browserstackNetworkLogs: bool(process.env.BROWSERSTACK_NETWORK_LOGS, true),
  browserstackDebug: bool(process.env.BROWSERSTACK_DEBUG, true),
  browserstackConsole: process.env.BROWSERSTACK_CONSOLE || 'info',
  browserstackPlaywrightVersion: optional(process.env.BROWSERSTACK_PLAYWRIGHT_VERSION),
  browserstackConnectTimeout: num(process.env.BROWSERSTACK_CONNECT_TIMEOUT, 120000),
  allureResultsDir: process.env.ALLURE_RESULTS_DIR || 'reports/allure-results',
  dashboardPort: num(process.env.DASHBOARD_PORT, 3000),
  runId: process.env.RUN_ID || '',
  runName: process.env.RUN_NAME || '',
  appUsername: process.env.APP_USERNAME || '',
  appPassword: process.env.APP_PASSWORD || '',
  appEncryptionKey: process.env.APP_ENCRYPTION_KEY || '',
};

export default env;
