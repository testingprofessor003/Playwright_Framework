import fs from 'fs';
import path from 'path';
import { CUSTOM_REPORT_DIR } from '../config/paths';
import { loadRunIndex, loadRun, HistoryScenario, HistoryInsight } from './historyStore';
import { formatDisplayDate, formatDuration } from '../utils/dates';
import { logger } from '../logger/logger';
import { ensureReportFavicon, ensureReportLogo, reportBrandCss, reportBrandMarkup, reportFaviconMarkup } from './branding';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function relativeScreenshot(screenshotPath?: string): string {
  if (!screenshotPath) return '';
  const abs = path.resolve(screenshotPath);
  const rel = path.relative(CUSTOM_REPORT_DIR, abs).replace(/\\/g, '/');
  return rel;
}

function failureCard(scenario: HistoryScenario, insights: HistoryInsight[]): string {
  const insight = insights.find((i) => i.scenarioId === scenario.id);
  const shot = relativeScreenshot(scenario.screenshotPath);
  return `
    <article class="card fail">
      <header>
        <h3>${escapeHtml(scenario.name)}</h3>
        <span class="badge">${escapeHtml(scenario.errorCategory || 'UNKNOWN')}</span>
      </header>
      <p class="meta">${escapeHtml(scenario.feature)} · ${escapeHtml(scenario.browser)} · ${formatDuration(scenario.durationMs || 0)}</p>
      <dl>
        <dt>Error code</dt><dd><code>${escapeHtml(scenario.errorCode || 'n/a')}</code></dd>
        <dt>Reason</dt><dd>${escapeHtml(scenario.errorMessage || 'No message captured')}</dd>
        <dt>Locator</dt><dd>${escapeHtml(scenario.locator || 'n/a')}</dd>
        <dt>URL</dt><dd>${escapeHtml(scenario.url || 'n/a')}</dd>
      </dl>
      ${
        insight
          ? `<div class="ai"><strong>AI triage</strong> (${escapeHtml(insight.confidence || 'n/a')}${
              insight.model ? ` · ${escapeHtml(insight.model)}` : ''
            })
             <p>${escapeHtml(insight.likelyCause)}</p>
             <p><em>Fix:</em> ${escapeHtml(insight.suggestedFix)}</p></div>`
          : ''
      }
      ${shot ? `<img src="${escapeHtml(shot)}" alt="Failure screenshot"/>` : ''}
      ${scenario.stack ? `<pre>${escapeHtml(scenario.stack)}</pre>` : ''}
    </article>`;
}

function shellHtml(options: {
  title: string;
  logoSrc: string;
  faviconSrc: string;
  heroTitleHtml: string;
  heroMetaHtml: string;
  bodyHtml: string;
}): string {
  const brand = reportBrandMarkup({
    logoSrc: options.logoSrc,
    titleHtml: options.heroTitleHtml,
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  ${reportFaviconMarkup(options.faviconSrc)}
  <title>${escapeHtml(options.title)}</title>
  <style>
    :root { --bg:#0f172a; --card:#1e293b; --text:#e2e8f0; --muted:#94a3b8; --fail:#f87171; --ok:#34d399; --accent:#38bdf8; --brand:#facc15; }
    body { font-family: Segoe UI, system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; }
    header.hero { padding: 28px 40px; background: linear-gradient(120deg,#0f172a,#1e3a5f); display: flex; justify-content: space-between; align-items: center; gap: 24px; flex-wrap: wrap; }
    header.hero h1 { margin: 0; font-size: 24px; }
    header.hero .hero-meta { color: var(--muted); max-width: 420px; text-align: right; }
    ${reportBrandCss()}
    .brand-lockup img.brand-logo { height: 64px; width: 64px; }
    .stats { display: flex; gap: 16px; padding: 0 40px 24px; flex-wrap: wrap; }
    .stat { background: var(--card); padding: 16px 20px; border-radius: 12px; min-width: 120px; }
    .stat b { display: block; font-size: 28px; }
    .grid { padding: 0 40px 40px; display: grid; gap: 16px; }
    .card { background: var(--card); border-radius: 12px; padding: 20px; border-left: 4px solid var(--fail); }
    .card header { display: flex; justify-content: space-between; align-items: center; }
    .badge { background: #7f1d1d; color: #fecaca; padding: 4px 10px; border-radius: 999px; font-size: 12px; }
    .meta, dt { color: var(--muted); }
    dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; }
    pre { background: #0b1220; padding: 12px; overflow: auto; font-size: 12px; border-radius: 8px; }
    img { max-width: 100%; border-radius: 8px; margin-top: 12px; }
    .ai { background: #0b3b4a; padding: 12px; border-radius: 8px; margin: 12px 0; }
    .ok { color: var(--ok); }
  </style>
</head>
<body>
  <header class="hero">
    ${brand}
    <div class="hero-meta">${options.heroMetaHtml}</div>
  </header>
  ${options.bodyHtml}
</body>
</html>`;
}

export function generateCustomFailureReport(runId?: string): string {
  const index = loadRunIndex();
  const run = runId ? loadRun(runId) : loadRun(index[0]?.id);
  fs.mkdirSync(CUSTOM_REPORT_DIR, { recursive: true });
  const logoSrc = ensureReportLogo(CUSTOM_REPORT_DIR);
  const faviconSrc = ensureReportFavicon(CUSTOM_REPORT_DIR);
  const outFile = path.join(CUSTOM_REPORT_DIR, 'failures.html');

  if (!run) {
    const empty = shellHtml({
      title: 'Failure Report',
      logoSrc,
      faviconSrc,
      heroTitleHtml: '<h1>Custom Failure Report</h1>',
      heroMetaHtml: '<p>No executions found. Run <code>npm test</code> first.</p>',
      bodyHtml: '<section class="grid"><p>No executions found.</p></section>',
    });
    fs.writeFileSync(outFile, empty, 'utf8');
    return outFile;
  }

  const failures = run.scenarios.filter((s) => s.status === 'failed');
  const insights = run.insights || [];
  const passRate = run.total ? Math.round((run.passed / run.total) * 100) : 0;

  const html = shellHtml({
    title: `Failure Report · ${run.name || run.id}`,
    logoSrc,
    faviconSrc,
    heroTitleHtml: '<h1>Custom Failure Report</h1>',
    heroMetaHtml: `<p>Run <strong>${escapeHtml(run.name || run.id)}</strong><br/>${escapeHtml(
      formatDisplayDate(run.startedAt),
    )} · ${escapeHtml(run.environment)} / ${escapeHtml(run.browser)}</p>`,
    bodyHtml: `<section class="stats">
    <div class="stat"><b>${run.total}</b>Total</div>
    <div class="stat"><b class="ok">${run.passed}</b>Passed</div>
    <div class="stat"><b>${run.failed}</b>Failed</div>
    <div class="stat"><b>${passRate}%</b>Pass rate</div>
    <div class="stat"><b>${formatDuration(run.durationMs)}</b>Duration</div>
  </section>
  <section class="grid">
    ${
      failures.length
        ? failures.map((f) => failureCard(f, insights)).join('\n')
        : '<p>No failures in this run.</p>'
    }
  </section>`,
  });

  fs.writeFileSync(outFile, html, 'utf8');
  logger.info(`Custom failure report written to ${outFile}`);
  return outFile;
}

if (require.main === module) {
  generateCustomFailureReport(process.env.RUN_ID);
}
