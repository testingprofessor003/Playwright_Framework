import path from 'path';
import fs from 'fs';
import { env } from './env';

export const ROOT_DIR = process.cwd();
export const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
export const LOGS_DIR = path.join(ROOT_DIR, 'logs');
export const SCREENSHOTS_DIR = path.join(REPORTS_DIR, 'screenshots');
export const STEP_SCREENSHOTS_DIR = path.join(SCREENSHOTS_DIR, 'steps');
export const ACTION_SCREENSHOTS_DIR = path.join(SCREENSHOTS_DIR, 'actions');
/** Playwright scenario videos live under recordings/test-runs (not reports/videos). */
export const RECORDINGS_DIR = path.join(ROOT_DIR, 'recordings');
export const RECORDED_EXECUTIONS_DIR = path.join(RECORDINGS_DIR, 'recorded executions');
export const VIDEOS_DIR = path.join(RECORDINGS_DIR, 'test-runs');
export const TRACES_DIR = path.join(REPORTS_DIR, 'traces');
export const DOWNLOADS_DIR = path.join(REPORTS_DIR, 'downloads');
export const CUSTOM_REPORT_DIR = path.join(REPORTS_DIR, 'custom');
export const EXTENT_REPORT_DIR = path.join(REPORTS_DIR, 'extent');
export const EXTENT_DATA_DIR = path.join(EXTENT_REPORT_DIR, 'data');
export const HISTORY_DIR = path.join(REPORTS_DIR, 'history');
export const ALLURE_RESULTS_DIR = path.resolve(ROOT_DIR, env.allureResultsDir);
export const SHARED_BUFFER_FILE = path.join(REPORTS_DIR, '.shared-buffer.json');
export const RUN_ID_FILE = path.join(REPORTS_DIR, '.run-id');
export const AUTH_DIR = path.join(REPORTS_DIR, '.auth');

export function ensureDirs(): void {
  for (const dir of [
    REPORTS_DIR,
    LOGS_DIR,
    SCREENSHOTS_DIR,
    STEP_SCREENSHOTS_DIR,
    ACTION_SCREENSHOTS_DIR,
    RECORDINGS_DIR,
    RECORDED_EXECUTIONS_DIR,
    VIDEOS_DIR,
    TRACES_DIR,
    DOWNLOADS_DIR,
    CUSTOM_REPORT_DIR,
    EXTENT_REPORT_DIR,
    EXTENT_DATA_DIR,
    HISTORY_DIR,
    ALLURE_RESULTS_DIR,
    AUTH_DIR,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirs();
