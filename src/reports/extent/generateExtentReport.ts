import fs from 'fs';
import path from 'path';
import os from 'os';
import { EXTENT_DATA_DIR, EXTENT_REPORT_DIR, ensureDirs } from '../../config/paths';
import { env } from '../../config/env';
import { formatDisplayDate, formatDuration, nowIso } from '../../utils/dates';
import { ExtentEnvironment, ExtentRun, ExtentTest } from './types';
import { logger } from '../../logger/logger';
import { loadRun } from '../historyStore';
import { ensureReportLogo, reportBrandCss, reportBrandMarkup } from '../branding';

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

function toRelativeArtifact(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return undefined;
  return path.relative(EXTENT_REPORT_DIR, abs).replace(/\\/g, '/');
}

function withRelativeArtifacts(test: ExtentTest): ExtentTest {
  return {
    ...test,
    screenshot: toRelativeArtifact(test.screenshot) || test.screenshot,
    video: toRelativeArtifact(test.video) || test.video,
    trace: toRelativeArtifact(test.trace) || test.trace,
    steps: test.steps.map((step) => ({
      ...step,
      activities: step.activities.map((activity) => ({
        ...activity,
        screenshot: toRelativeArtifact(activity.screenshot) || activity.screenshot,
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

export function renderExtentHtml(run: ExtentRun, logoSrc = 'testing-professor-logo.png'): string {
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
    .shot { max-width: 100%; border-radius: 8px; margin-top: 12px; border: 1px solid var(--line); }
    .shot.step { margin-top: 8px; max-height: 360px; object-fit: contain; }
    .artifacts { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
    .artifacts a { color: var(--info); }
    video.shot { max-height: 420px; background: #000; }
    .ai { background: #0b3b4a; padding: 12px; border-radius: 8px; margin-top: 12px; }
    .ai strong { color: var(--info); }
    .empty { padding: 40px; color: var(--muted); text-align: center; }
  </style>
</head>
<body>
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
            (activity.screenshot ? '<img class="shot step" src="' + escape(activity.screenshot) + '" alt="Step screenshot"/>' : '') +
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
        (test.screenshot ? '<img class="shot" src="' + escape(test.screenshot) + '" alt="Scenario screenshot"/>' : '') +
        (test.video
          ? '<div class="artifact-video"><video class="shot" controls src="' + escape(test.video) + '"></video>' +
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
  const logoSrc = ensureReportLogo(EXTENT_REPORT_DIR);
  const run = buildExtentRun();
  const outFile = path.join(EXTENT_REPORT_DIR, 'index.html');
  fs.writeFileSync(outFile, renderExtentHtml(run, logoSrc), 'utf8');
  fs.writeFileSync(path.join(EXTENT_REPORT_DIR, 'last-run.json'), JSON.stringify(run, null, 2), 'utf8');
  logger.info(`Extent activity report written to ${outFile}`);
  return outFile;
}

if (require.main === module) {
  generateExtentReport();
}
