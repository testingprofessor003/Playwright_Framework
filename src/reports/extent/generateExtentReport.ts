import fs from 'fs';
import path from 'path';
import os from 'os';
import { EXTENT_DATA_DIR, EXTENT_REPORT_DIR, ensureDirs } from '../../config/paths';
import { env } from '../../config/env';
import { formatDisplayDate, formatDuration, nowIso } from '../../utils/dates';
import { sanitizeFileName } from '../../utils/files';
import { ExtentEnvironment, ExtentRun, ExtentTest } from './types';
import { logger } from '../../logger/logger';
import { loadRun } from '../historyStore';
import { ensureReportFavicon, ensureReportLogo, reportBrandCss, reportBrandMarkup, reportFaviconMarkup } from '../branding';
import { stageExtentArtifact } from '../publishArtifacts';

const EXTENT_HISTORY_DIR = path.join(EXTENT_REPORT_DIR, 'history');
const EXTENT_HISTORY_INDEX = path.join(EXTENT_REPORT_DIR, 'history-index.json');

export type ExtentHistoryEntry = {
  id: string;
  name: string;
  file: string;
  startedAt: string;
  finishedAt: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  browser?: string;
  environment?: string;
};
function loadTests(): ExtentTest[] {
  if (!fs.existsSync(EXTENT_DATA_DIR)) return [];
  return fs
    .readdirSync(EXTENT_DATA_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(EXTENT_DATA_DIR, file), 'utf8')) as ExtentTest;
      } catch {
        return undefined;
      }
    })
    .filter((test): test is ExtentTest => Boolean(test))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function loadRunMeta(): { id?: string; name?: string; startedAt?: string } {
  const file = path.join(EXTENT_REPORT_DIR, 'run-meta.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as { id?: string; name?: string; startedAt?: string };
  } catch {
    return {};
  }
}

function resolveArtifactFile(filePath: string): string | undefined {
  if (!filePath || filePath.startsWith('data:')) return undefined;
  const candidates = [path.resolve(filePath), path.resolve(EXTENT_REPORT_DIR, filePath)];
  for (const abs of candidates) {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return undefined;
}

/** Embed screenshot bytes as a data-URI so the HTML report is shareable without sidecar files. */
function toBase64Screenshot(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  if (filePath.startsWith('data:image/')) return filePath;
  const abs = resolveArtifactFile(filePath);
  if (!abs) return undefined;
  const ext = path.extname(abs).toLowerCase();
  const mime =
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

function toRelativeArtifact(filePath: string | undefined, kind: 'videos' | 'traces'): string | undefined {
  if (!filePath) return undefined;
  const abs = resolveArtifactFile(filePath) || path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    logger.warn(`Extent ${kind} artifact is missing on disk: ${filePath}`);
    return undefined;
  }
  // Stage under reports/extent/<kind>/ and history/<kind>/ so both latest.html
  // and history/*.html can use the same relative src without file:// `..` blocks.
  const staged = stageExtentArtifact(abs, kind);
  if (staged) return staged;
  return path.relative(EXTENT_REPORT_DIR, abs).replace(/\\/g, '/');
}

function withRelativeArtifacts(test: ExtentTest): ExtentTest {
  return {
    ...test,
    screenshot: toBase64Screenshot(test.screenshot) || test.screenshot,
    video: toRelativeArtifact(test.video, 'videos'),
    trace: toRelativeArtifact(test.trace, 'traces'),
    steps: test.steps.map((step) => ({
      ...step,
      activities: step.activities.map((activity) => ({
        ...activity,
        screenshot: toBase64Screenshot(activity.screenshot) || activity.screenshot,
      })),
    })),
  };
}

function withInsights(tests: ExtentTest[]): ExtentTest[] {
  const runId = tests[0]?.runId;
  const insights = (runId ? loadRun(runId)?.insights : undefined) || [];
  if (!insights.length) return tests;
  const byScenario = new Map(insights.map((insight) => [insight.scenarioId, insight]));
  return tests.map((test) => {
    const insight = byScenario.get(test.id);
    if (!insight) return test;
    return {
      ...test,
      insight: {
        likelyCause: insight.likelyCause,
        category: insight.category,
        suggestedFix: insight.suggestedFix,
        confidence: insight.confidence,
        model: insight.model,
      },
    };
  });
}

export function buildExtentRun(): ExtentRun {
  const meta = loadRunMeta();
  const tests = withInsights(loadTests().map(withRelativeArtifacts));
  const startedAt = meta.startedAt || tests[0]?.startedAt || nowIso();
  const finishedAt = tests[tests.length - 1]?.finishedAt || nowIso();
  const activityCount = tests.reduce(
    (sum, test) => sum + test.steps.reduce((stepSum, step) => stepSum + step.activities.length, 0),
    0,
  );
  const failedActivityCount = tests.reduce(
    (sum, test) =>
      sum +
      test.steps.reduce(
        (stepSum, step) => stepSum + step.activities.filter((activity) => activity.status === 'fail').length,
        0,
      ),
    0,
  );

  const environment: ExtentEnvironment = {
    browser: env.browser,
    headed: !env.headless,
    baseUrl: env.baseUrl,
    executionEnv: env.executionEnv,
    os: `${os.type()} ${os.release()}`,
    node: process.version,
    parallel: env.parallel,
    runName: meta.name || env.runName || 'Playwright BDD run',
    runId: meta.id || env.runId || tests[0]?.runId || 'local-run',
  };

  return {
    id: environment.runId,
    name: environment.runName,
    startedAt,
    finishedAt,
    environment,
    tests,
    total: tests.length,
    passed: tests.filter((test) => test.status === 'passed').length,
    failed: tests.filter((test) => test.status === 'failed').length,
    skipped: tests.filter((test) => test.status === 'skipped').length,
    durationMs: tests.reduce((sum, test) => sum + (test.durationMs || 0), 0),
    activityCount,
    failedActivityCount,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderExtentHtml(
  run: ExtentRun,
  logoSrc = 'testing-professor-logo.png',
  faviconSrc = 'testing-professor-favicon.png',
): string {
  const payload = JSON.stringify(run).replace(/</g, '\\u003c');
  const passPct = run.total ? Math.round((run.passed / run.total) * 100) : 0;
  const brand = reportBrandMarkup({
    logoSrc,
    titleHtml: '<h1>ACTIVITY <span>REPORT</span></h1>',
    subtitle: 'Extent-style execution log for every step and UI action',
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  ${reportFaviconMarkup(faviconSrc)}
  <title>Activity Report · ${escapeHtml(run.name)}</title>
  <style>
    :root {
      --bg: #0b1220;
      --panel: #111827;
      --card: #1e293b;
      --line: #334155;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --pass: #34d399;
      --fail: #f87171;
      --skip: #fbbf24;
      --info: #38bdf8;
      --warn: #f59e0b;
      --accent: #6366f1;
      --brand: #facc15;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Segoe UI, system-ui, sans-serif; background: var(--bg); color: var(--text); }
    header.app { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: #0f172a; border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 5; gap: 16px; }
    header.app h1 { margin: 0; font-size: 20px; letter-spacing: .04em; }
    header.app h1 span { color: var(--accent); }
    ${reportBrandCss()}
    .meta { color: var(--muted); font-size: 13px; text-align: right; }
    nav.tabs { display: flex; gap: 8px; padding: 12px 24px; border-bottom: 1px solid var(--line); }
    nav.tabs button { background: transparent; color: var(--muted); border: 1px solid transparent; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
    nav.tabs button.active { color: var(--text); background: var(--card); border-color: var(--line); }
    .view { display: none; padding: 24px; }
    .view.active { display: block; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .stat { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
    .stat b { display: block; font-size: 28px; margin-top: 4px; }
    .pass { color: var(--pass); }
    .fail { color: var(--fail); }
    .skip { color: var(--skip); }
    .info { color: var(--info); }
    .layout { display: grid; grid-template-columns: 280px 1fr; gap: 20px; }
    .donut-wrap { display: flex; gap: 24px; align-items: center; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
    .donut { width: 160px; height: 160px; border-radius: 50%; display: grid; place-items: center; position: relative; }
    .donut::after { content: ""; width: 96px; height: 96px; background: var(--card); border-radius: 50%; }
    .donut-label { position: absolute; text-align: center; font-size: 13px; color: var(--muted); }
    .donut-label strong { display: block; color: var(--text); font-size: 28px; }
    .env, .features { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); font-size: 13px; }
    th { color: var(--muted); font-weight: 600; }
    .tests { display: grid; grid-template-columns: 340px 1fr; gap: 16px; min-height: 70vh; }
    .list, .detail { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    .toolbar { display: flex; gap: 8px; padding: 12px; border-bottom: 1px solid var(--line); }
    .toolbar input, .toolbar select { background: var(--card); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; width: 100%; }
    .toolbar select { width: 120px; }
    .test-item { padding: 12px 14px; border-bottom: 1px solid var(--line); cursor: pointer; }
    .test-item:hover, .test-item.selected { background: var(--card); }
    .test-item h3 { margin: 0 0 6px; font-size: 14px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .badge.passed { background: #064e3b; color: var(--pass); }
    .badge.failed { background: #7f1d1d; color: #fecaca; }
    .badge.skipped { background: #78350f; color: var(--skip); }
    .badge.pass { background: #064e3b; color: var(--pass); }
    .badge.fail { background: #7f1d1d; color: #fecaca; }
    .badge.skip { background: #78350f; color: var(--skip); }
    .badge.info { background: #0c4a6e; color: var(--info); }
    .badge.warn { background: #78350f; color: var(--warn); }
    .muted { color: var(--muted); font-size: 12px; }
    .detail { padding: 0; }
    .detail-head { padding: 16px 20px; border-bottom: 1px solid var(--line); }
    .detail-head h2 { margin: 0 0 8px; font-size: 18px; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .tag { background: #312e81; color: #c7d2fe; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
    .step { border-bottom: 1px solid var(--line); }
    .step-h { display: flex; justify-content: space-between; gap: 12px; padding: 12px 20px; cursor: pointer; }
    .step-h:hover { background: var(--card); }
    .step-h .left { display: flex; gap: 10px; align-items: center; }
    .kw { color: var(--accent); font-weight: 700; min-width: 48px; }
    .activities { display: none; padding: 0 12px 12px 48px; }
    .step.open .activities { display: block; }
    .detail { padding: 0; overflow: auto; max-height: calc(100vh - 180px); }
    .detail-actions { display: flex; gap: 8px; margin-top: 12px; }
    .detail-actions button, #openTests { background: var(--card); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
    .activity { display: grid; grid-template-columns: 72px 1fr auto; gap: 10px; padding: 8px 10px; border-left: 3px solid var(--line); background: #0f172a; margin-bottom: 6px; border-radius: 0 8px 8px 0; }
    .activity.pass { border-left-color: var(--pass); }
    .activity.fail { border-left-color: var(--fail); }
    .activity.warn { border-left-color: var(--warn); }
    .activity.info, .activity.skip { border-left-color: var(--info); }
    .activity .cat { font-size: 11px; text-transform: uppercase; color: var(--muted); }
    .activity .name { font-size: 13px; }
    .activity .extra { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .error { color: #fecaca; white-space: pre-wrap; font-size: 12px; margin-top: 6px; }
    .shot-thumb {
      display: inline-block;
      margin-top: 8px;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0b1220;
      cursor: zoom-in;
      overflow: hidden;
      vertical-align: top;
    }
    .shot-thumb img {
      display: block;
      width: 160px;
      height: 100px;
      object-fit: cover;
      object-position: top center;
    }
    .shot-thumb.scenario img { width: 220px; height: 130px; }
    .shot-thumb:hover { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    .shot-thumb:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .artifacts { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
    .artifacts a { color: var(--info); }
    video.shot { max-width: 100%; max-height: 420px; border-radius: 8px; border: 1px solid var(--line); background: #000; }
    .lightbox {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(2, 6, 23, 0.92);
      align-items: center;
      justify-content: center;
      padding: 24px;
      cursor: zoom-out;
    }
    .lightbox.open { display: flex; }
    .lightbox img {
      max-width: min(96vw, 1600px);
      max-height: 92vh;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid var(--line);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
      cursor: default;
    }
    .lightbox-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: var(--card);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
    }
    .lightbox-hint {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      color: var(--muted);
      font-size: 12px;
    }
    .ai { background: #0b3b4a; padding: 12px; border-radius: 8px; margin-top: 12px; }
    .ai strong { color: var(--info); }
    .empty { padding: 40px; color: var(--muted); text-align: center; }
  </style>
</head>
<body>
  <div id="lightbox" class="lightbox" role="dialog" aria-modal="true" aria-label="Screenshot preview" hidden>
    <button type="button" class="lightbox-close" id="lightboxClose" aria-label="Close fullscreen screenshot">Close</button>
    <img id="lightboxImg" alt="Fullscreen screenshot"/>
    <div class="lightbox-hint">Click outside the image or press Esc to close</div>
  </div>
  <header class="app">
    ${brand}
    <div class="meta">
      <div>${escapeHtml(run.name)}</div>
      <div>${escapeHtml(formatDisplayDate(run.startedAt))} · ${escapeHtml(run.environment.browser)} / ${escapeHtml(run.environment.executionEnv)}</div>
    </div>
  </header>
  <nav class="tabs">
    <button data-view="dashboard">Dashboard</button>
    <button class="active" data-view="tests">Tests</button>
  </nav>
  <section id="dashboard" class="view">
    <div class="stats">
      <div class="stat">Total tests<b>${run.total}</b></div>
      <div class="stat">Passed<b class="pass">${run.passed}</b></div>
      <div class="stat">Failed<b class="fail">${run.failed}</b></div>
      <div class="stat">Skipped<b class="skip">${run.skipped}</b></div>
      <div class="stat">Pass rate<b>${passPct}%</b></div>
      <div class="stat">Duration<b>${escapeHtml(formatDuration(run.durationMs))}</b></div>
      <div class="stat">Activities logged<b class="info">${run.activityCount}</b></div>
      <div class="stat">Failed activities<b class="fail">${run.failedActivityCount}</b></div>
    </div>
    <div class="donut-wrap">
      <div class="donut" id="donut">
        <div class="donut-label"><strong>${passPct}%</strong>passed</div>
      </div>
      <div>
        <p class="muted">Click <strong>Tests</strong> to see every Gherkin step and the Playwright actions under it. ${run.activityCount} activities were captured in this run.</p>
        <p>Base URL: <code>${escapeHtml(run.environment.baseUrl)}</code></p>
        <p><button type="button" id="openTests">Open step activity log</button></p>
      </div>
    </div>
    <div class="env">
      <h3>Environment</h3>
      <table>
        <tr><th>Run ID</th><td>${escapeHtml(run.environment.runId)}</td></tr>
        <tr><th>Browser</th><td>${escapeHtml(run.environment.browser)} (${run.environment.headed ? 'headed' : 'headless'})</td></tr>
        <tr><th>OS</th><td>${escapeHtml(run.environment.os)}</td></tr>
        <tr><th>Node</th><td>${escapeHtml(run.environment.node)}</td></tr>
        <tr><th>Parallel</th><td>${run.environment.parallel}</td></tr>
      </table>
    </div>
    <div class="features" id="features"></div>
  </section>
  <section id="tests" class="view active">
    <div class="tests">
      <div class="list">
        <div class="toolbar">
          <input id="search" placeholder="Search tests, steps, or actions"/>
          <select id="statusFilter">
            <option value="all">All</option>
            <option value="failed">Failed</option>
            <option value="passed">Passed</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
        <div id="testList"></div>
      </div>
      <div class="detail" id="detail"><div class="empty">Select a test to inspect its activity log.</div></div>
    </div>
  </section>
  <script>
    window.EXTENT_DATA = ${payload};
  </script>
  <script>
    const data = window.EXTENT_DATA;
    const pass = data.total ? (data.passed / data.total) * 360 : 0;
    const fail = data.total ? (data.failed / data.total) * 360 : 0;
    const skip = data.total ? (data.skipped / data.total) * 360 : 0;
    document.getElementById('donut').style.background =
      'conic-gradient(#34d399 0deg ' + pass + 'deg, #f87171 ' + pass + 'deg ' + (pass + fail) + 'deg, #fbbf24 ' + (pass + fail) + 'deg ' + (pass + fail + skip) + 'deg, #334155 0deg)';

    const byFeature = {};
    data.tests.forEach((test) => {
      const key = test.feature || 'Unknown feature';
      byFeature[key] = byFeature[key] || { total: 0, passed: 0, failed: 0, skipped: 0 };
      byFeature[key].total += 1;
      byFeature[key][test.status] += 1;
    });
    document.getElementById('features').innerHTML =
      '<h3>Features</h3><table><tr><th>Feature</th><th>Total</th><th>Passed</th><th>Failed</th></tr>' +
      Object.keys(byFeature).map((name) => {
        const row = byFeature[name];
        return '<tr><td>' + escape(name) + '</td><td>' + row.total + '</td><td class="pass">' + row.passed + '</td><td class="fail">' + row.failed + '</td></tr>';
      }).join('') + '</table>';

    document.querySelectorAll('nav.tabs button').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('nav.tabs button').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
        button.classList.add('active');
        document.getElementById(button.dataset.view).classList.add('active');
      });
    });
    const openTests = document.getElementById('openTests');
    if (openTests) {
      openTests.addEventListener('click', () => {
        document.querySelector('nav.tabs button[data-view="tests"]').click();
      });
    }

    let selectedId = data.tests.find((test) => test.status === 'failed')?.id || data.tests[0]?.id;

    function escape(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function duration(ms) {
      if (!ms && ms !== 0) return '';
      if (ms < 1000) return ms + 'ms';
      return (ms / 1000).toFixed(2) + 's';
    }

    function shotThumb(src, alt, variant) {
      if (!src) return '';
      const cls = variant === 'scenario' ? 'shot-thumb scenario' : 'shot-thumb';
      return '<button type="button" class="' + cls + '" data-fullsrc="' + escape(src) + '" title="Click to view fullscreen">' +
        '<img src="' + escape(src) + '" alt="' + escape(alt || 'Screenshot') + '" loading="lazy"/>' +
        '</button>';
    }

    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxClose = document.getElementById('lightboxClose');

    function openLightbox(src, alt) {
      if (!src) return;
      lightboxImg.src = src;
      lightboxImg.alt = alt || 'Fullscreen screenshot';
      lightbox.classList.add('open');
      lightbox.hidden = false;
      lightboxClose.focus();
    }

    function closeLightbox() {
      lightbox.classList.remove('open');
      lightbox.hidden = true;
      lightboxImg.removeAttribute('src');
    }

    function bindShotThumbs(root) {
      (root || document).querySelectorAll('.shot-thumb').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openLightbox(btn.getAttribute('data-fullsrc') || btn.querySelector('img')?.src, btn.querySelector('img')?.alt);
        });
      });
    }

    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox || event.target === lightboxClose) closeLightbox();
    });
    lightboxImg.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
    });

    function renderList() {
      const query = document.getElementById('search').value.toLowerCase();
      const status = document.getElementById('statusFilter').value;
      const tests = data.tests.filter((test) => {
        if (status !== 'all' && test.status !== status) return false;
        const haystack = [
          test.name,
          test.feature,
          (test.tags || []).join(' '),
          test.steps.map((step) => step.name + ' ' + step.activities.map((activity) => activity.name).join(' ')).join(' '),
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      });
      document.getElementById('testList').innerHTML = tests.map((test) => {
        return '<div class="test-item' + (test.id === selectedId ? ' selected' : '') + '" data-id="' + test.id + '">' +
          '<h3>' + escape(test.name) + '</h3>' +
          '<span class="badge ' + test.status + '">' + test.status + '</span> ' +
          '<span class="muted">' + escape(test.feature) + ' · ' + duration(test.durationMs) + '</span></div>';
      }).join('') || '<div class="empty">No tests match this filter.</div>';
      document.querySelectorAll('.test-item').forEach((item) => {
        item.addEventListener('click', () => {
          selectedId = item.dataset.id;
          renderList();
          renderDetail();
        });
      });
    }

    function renderDetail() {
      const test = data.tests.find((item) => item.id === selectedId);
      if (!test) {
        document.getElementById('detail').innerHTML = '<div class="empty">Select a test to inspect its activity log.</div>';
        return;
      }
      const tags = (test.tags || []).map((tag) => '<span class="tag">' + escape(tag) + '</span>').join('');
      const steps = (test.steps || []).map((step) => {
        const activities = (step.activities || []).map((activity) => {
          return '<div class="activity ' + activity.status + '">' +
            '<div class="cat">' + escape(activity.category) + '</div>' +
            '<div><div class="name">' + escape(activity.name) + '</div>' +
            (activity.locator ? '<div class="extra">Locator: ' + escape(activity.locator) + '</div>' : '') +
            (activity.url ? '<div class="extra">URL: ' + escape(activity.url) + '</div>' : '') +
            (activity.details ? '<div class="extra">' + escape(activity.details) + '</div>' : '') +
            (activity.error ? '<div class="error">' + escape(activity.error) + '</div>' : '') +
            shotThumb(activity.screenshot, 'Action screenshot') +
            '</div>' +
            '<div class="muted">' + duration(activity.durationMs) + '</div></div>';
        }).join('');
        return '<div class="step open">' +
          '<div class="step-h"><div class="left"><span class="kw">' + escape(step.keyword || '') + '</span>' +
          '<span>' + escape(step.name) + '</span></div>' +
          '<div><span class="badge ' + step.status + '">' + step.status + '</span> ' +
          '<span class="muted">' + duration(step.durationMs) + ' · ' + (step.activities || []).length + ' activities</span></div></div>' +
          '<div class="activities">' + (activities || '<div class="muted">No activities captured for this step.</div>') + '</div></div>';
      }).join('');
      document.getElementById('detail').innerHTML =
        '<div class="detail-head"><h2>' + escape(test.name) + '</h2>' +
        '<span class="badge ' + test.status + '">' + test.status + '</span> ' +
        '<span class="muted">' + escape(test.feature) + ' · ' + escape(test.browser) + ' · ' + duration(test.durationMs) + '</span>' +
        '<div class="tags">' + tags + '</div>' +
        (test.error ? '<div class="error">' + escape(test.error) + '</div>' : '') +
        (test.insight ? '<div class="ai"><strong>AI triage</strong> (' + escape(test.insight.confidence || 'n/a') + (test.insight.category ? ' · ' + escape(test.insight.category) : '') + (test.insight.model ? ' · ' + escape(test.insight.model) : '') + ')<p>' + escape(test.insight.likelyCause || '') + '</p><p><em>Fix:</em> ' + escape(test.insight.suggestedFix || '') + '</p></div>' : '') +
        '<div class="detail-actions"><button type="button" id="expandAll">Expand all steps</button><button type="button" id="collapseAll">Collapse all steps</button></div>' +
        '<div class="artifacts">' +
        shotThumb(test.screenshot, 'Scenario screenshot', 'scenario') +
        (test.video
          ? '<div class="artifact-video"><video class="shot" controls preload="metadata">' +
            '<source src="' + escape(test.video) + '" type="video/webm">' +
            '</video>' +
            '<p class="muted"><a href="' + escape(test.video) + '" download>Open / download scenario recording</a> ' +
            '<span>(' + escape(test.video) + ')</span></p></div>'
          : '') +
        (test.trace ? '<p class="muted"><a href="' + escape(test.trace) + '" download>Download Playwright trace (.zip)</a> — open with <code>npx playwright show-trace</code></p>' : '') +
        '</div>' +
        '</div>' + steps;
      document.querySelectorAll('.step-h').forEach((header) => {
        header.addEventListener('click', () => header.parentElement.classList.toggle('open'));
      });
      const expandAll = document.getElementById('expandAll');
      const collapseAll = document.getElementById('collapseAll');
      if (expandAll) expandAll.addEventListener('click', () => document.querySelectorAll('.step').forEach((step) => step.classList.add('open')));
      if (collapseAll) collapseAll.addEventListener('click', () => document.querySelectorAll('.step').forEach((step) => step.classList.remove('open')));
      bindShotThumbs(document.getElementById('detail'));
    }

    document.getElementById('search').addEventListener('input', renderList);
    document.getElementById('statusFilter').addEventListener('change', renderList);
    renderList();
    renderDetail();
  </script>
</body>
</html>`;
}

export function generateExtentReport(): string {
  ensureDirs();
  fs.mkdirSync(EXTENT_REPORT_DIR, { recursive: true });
  fs.mkdirSync(EXTENT_HISTORY_DIR, { recursive: true });
  const logoSrc = ensureReportLogo(EXTENT_REPORT_DIR);
  const faviconSrc = ensureReportFavicon(EXTENT_REPORT_DIR);
  const run = buildExtentRun();
  const safeId = sanitizeFileName(run.id || run.name || `run-${Date.now()}`) || `run-${Date.now()}`;
  const historyRelative = `history/${safeId}.html`;
  const historyFile = path.join(EXTENT_REPORT_DIR, historyRelative);
  const latestFile = path.join(EXTENT_REPORT_DIR, 'latest.html');
  const indexFile = path.join(EXTENT_REPORT_DIR, 'index.html');

  // Per-run HTML (Base64 screenshots embedded) — never overwrite other executions.
  fs.writeFileSync(historyFile, renderExtentHtml(run, `../${logoSrc}`, `../${faviconSrc}`), 'utf8');
  // Convenience copy of the most recent run.
  fs.writeFileSync(latestFile, renderExtentHtml(run, logoSrc, faviconSrc), 'utf8');

  const entry: ExtentHistoryEntry = {
    id: run.id,
    name: run.name,
    file: historyRelative.replace(/\\/g, '/'),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    total: run.total,
    passed: run.passed,
    failed: run.failed,
    skipped: run.skipped,
    durationMs: run.durationMs,
    browser: run.environment.browser,
    environment: run.environment.executionEnv,
  };
  const history = upsertHistoryEntry(entry);
  fs.writeFileSync(indexFile, renderExtentArchiveHtml(history, logoSrc, faviconSrc), 'utf8');
  fs.writeFileSync(
    path.join(EXTENT_REPORT_DIR, 'last-run.json'),
    JSON.stringify({ ...entry, reportFile: historyRelative.replace(/\\/g, '/'), latestFile: 'latest.html' }, null, 2),
    'utf8',
  );

  logger.info(`Extent activity report written to ${historyFile}`);
  logger.info(`Extent archive index: ${indexFile} (latest: ${latestFile})`);
  return historyFile;
}

function loadHistoryIndex(): ExtentHistoryEntry[] {
  if (!fs.existsSync(EXTENT_HISTORY_INDEX)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(EXTENT_HISTORY_INDEX, 'utf8')) as ExtentHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function upsertHistoryEntry(entry: ExtentHistoryEntry): ExtentHistoryEntry[] {
  const existing = loadHistoryIndex().filter((item) => item.id !== entry.id);
  const next = [entry, ...existing].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  fs.writeFileSync(EXTENT_HISTORY_INDEX, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function renderExtentArchiveHtml(
  history: ExtentHistoryEntry[],
  logoSrc: string,
  faviconSrc = 'testing-professor-favicon.png',
): string {
  const brand = reportBrandMarkup({
    logoSrc,
    titleHtml: '<h1>ACTIVITY <span>ARCHIVE</span></h1>',
    subtitle: 'Every execution keeps its own Extent report — pick a run to open',
  });
  const rows = history.length
    ? history
        .map((entry, index) => {
          const latest = index === 0 ? ' <span class="pill">latest</span>' : '';
          return `<tr>
      <td><a href="${escapeHtml(entry.file)}">${escapeHtml(entry.name)}</a>${latest}</td>
      <td>${escapeHtml(formatDisplayDate(entry.finishedAt))}</td>
      <td>${escapeHtml(entry.browser || '')} · ${escapeHtml(entry.environment || '')}</td>
      <td class="pass">${entry.passed}</td>
      <td class="fail">${entry.failed}</td>
      <td class="skip">${entry.skipped}</td>
      <td>${escapeHtml(formatDuration(entry.durationMs || 0))}</td>
      <td><a class="btn" href="${escapeHtml(entry.file)}">Open</a></td>
    </tr>`;
        })
        .join('\n')
    : `<tr><td colspan="8" class="empty">No Extent runs archived yet. Execute tests to generate the first report.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  ${reportFaviconMarkup(faviconSrc)}
  <title>Activity Report Archive</title>
  <style>
    :root {
      --bg: #0b1220; --card: #1e293b; --line: #334155; --text: #e2e8f0; --muted: #94a3b8;
      --pass: #34d399; --fail: #f87171; --skip: #fbbf24; --accent: #6366f1;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Segoe UI, system-ui, sans-serif; background: var(--bg); color: var(--text); }
    header.app { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: #0f172a; border-bottom: 1px solid var(--line); gap: 16px; }
    ${reportBrandCss()}
    .wrap { padding: 24px; max-width: 1100px; margin: 0 auto; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; }
    .actions { margin: 0 0 16px; display: flex; gap: 10px; flex-wrap: wrap; }
    .btn, a.btn { display: inline-block; background: var(--accent); color: white; text-decoration: none; padding: 8px 14px; border-radius: 8px; font-size: 13px; }
    a { color: #93c5fd; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); font-size: 13px; vertical-align: middle; }
    th { color: var(--muted); font-weight: 600; }
    .pass { color: var(--pass); } .fail { color: var(--fail); } .skip { color: var(--skip); }
    .pill { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 999px; background: #312e81; color: #c7d2fe; font-size: 11px; }
    .empty { color: var(--muted); text-align: center; padding: 24px !important; }
    .meta { color: var(--muted); font-size: 13px; }
  </style>
</head>
<body>
  <header class="app">${brand}<div class="meta">${history.length} saved run${history.length === 1 ? '' : 's'}</div></header>
  <div class="wrap">
    <div class="actions">
      <a class="btn" href="latest.html">Open latest report</a>
    </div>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Run</th><th>Finished</th><th>Env</th><th>Passed</th><th>Failed</th><th>Skipped</th><th>Duration</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

if (require.main === module) {
  generateExtentReport();
}
