const views = document.querySelectorAll('.view');
const navButtons = document.querySelectorAll('.nav');
const viewTitle = document.getElementById('viewTitle');
const runFilter = document.getElementById('runFilter');

let trendChart;
let allRuns = [];
let allFailures = [];
let allInsights = [];
let selectedRunId = '';
let runsPage = 1;
let failuresPage = 1;
let insightsPage = 1;
let pageSize = Number(localStorage.getItem('pw-bdd-page-size') || 8) || 8;

const PAGE_SIZE_OPTIONS = [5, 8, 10, 20, 50];

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    navButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    views.forEach((v) => v.classList.toggle('hidden', v.id !== view));
    viewTitle.textContent = btn.textContent;
  });
});

function pad(n) {
  return String(n).padStart(2, '0');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDisplayDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function titleCase(value) {
  if (!value) return '';
  return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
}

function runName(run) {
  const scenarios = (run.scenarios || []).map((s) => s.name).filter(Boolean);
  const browser = titleCase(run.browser || 'chrome');
  const environment = titleCase(run.environment || 'local');
  const when = formatDisplayDate(run.started_at || run.startedAt);
  const base = `${browser} ${environment} ${when}`;
  if (scenarios.length) {
    const label = scenarios.length <= 2 ? scenarios.join(', ') : `${scenarios[0]} +${scenarios.length - 1} more`;
    return `${label} | ${base}`;
  }
  if (run.name && !String(run.name).startsWith('run-') && String(run.name).includes('|')) {
    return run.name;
  }
  if (run.name && !String(run.name).startsWith('run-')) {
    return run.name;
  }
  return base;
}

function shortLabel(text, max = 64) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

function num(v) {
  return Number(v || 0);
}

function passRate(run) {
  const total = num(run.total);
  return total ? Math.round((num(run.passed) / total) * 100) : 0;
}

function filteredRuns() {
  if (!selectedRunId) return allRuns;
  return allRuns.filter((run) => run.id === selectedRunId);
}

function pageSlice(items, page, size) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: current,
    pages,
    total,
    start: total ? start + 1 : 0,
    end: Math.min(start + size, total),
  };
}

function pagerHtml(kind, pageInfo) {
  const disabledPrev = pageInfo.page <= 1 ? 'disabled' : '';
  const disabledNext = pageInfo.page >= pageInfo.pages ? 'disabled' : '';
  const sizeOptions = PAGE_SIZE_OPTIONS.map(
    (size) => `<option value="${size}"${size === pageSize ? ' selected' : ''}>${size}/page</option>`,
  ).join('');
  return `<div class="pager" data-pager="${kind}">
    <button type="button" data-pager-action="prev" ${disabledPrev}>Prev</button>
    <span class="pager-meta">Showing ${pageInfo.start}-${pageInfo.end} of ${pageInfo.total} · Page ${pageInfo.page}/${pageInfo.pages}</span>
    <button type="button" data-pager-action="next" ${disabledNext}>Next</button>
    <select data-pager-action="size" aria-label="Rows per page">${sizeOptions}</select>
  </div>`;
}

function bindPagers(root) {
  (root || document).querySelectorAll('.pager').forEach((pager) => {
    if (pager.dataset.bound === '1') return;
    pager.dataset.bound = '1';
    pager.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-pager-action]');
      if (!btn || btn.tagName === 'SELECT') return;
      const action = btn.getAttribute('data-pager-action');
      const kind = pager.dataset.pager;
      if (action === 'prev') changePage(kind, -1);
      if (action === 'next') changePage(kind, 1);
    });
    pager.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || target.getAttribute('data-pager-action') !== 'size') return;
      pageSize = Number(target.value) || 8;
      try {
        localStorage.setItem('pw-bdd-page-size', String(pageSize));
      } catch {
        /* ignore */
      }
      runsPage = 1;
      failuresPage = 1;
      insightsPage = 1;
      renderRunsTables();
      renderFailures(allFailures);
      renderInsights(allInsights);
    });
  });
}

function changePage(kind, delta) {
  if (kind === 'runs' || kind === 'recent') {
    runsPage += delta;
    renderRunsTables();
    return;
  }
  if (kind === 'failures') {
    failuresPage += delta;
    renderFailures(allFailures);
    return;
  }
  if (kind === 'insights') {
    insightsPage += delta;
    renderInsights(allInsights);
  }
}

function renderKpis(runs) {
  const latest = runs[0] || { total: 0, passed: 0, failed: 0 };
  const avg = runs.length && runs.reduce((s, r) => s + passRate(r), 0) / runs.length;
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><b>${runs.length}</b><span class="muted">${selectedRunId ? 'Filtered runs' : 'Historical runs'}</span></div>
    <div class="kpi"><b>${num(latest.total)}</b><span class="muted">${selectedRunId ? 'Selected run tests' : 'Last run tests'}</span></div>
    <div class="kpi"><b class="fail">${num(latest.failed)}</b><span class="muted">${selectedRunId ? 'Selected failures' : 'Last run failures'}</span></div>
    <div class="kpi"><b class="ok">${Math.round(avg || 0)}%</b><span class="muted">Avg pass rate</span></div>`;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartTheme() {
  return {
    label: cssVar('--chart-label') || '#e5e7eb',
    muted: cssVar('--chart-muted') || '#94a3b8',
    grid: cssVar('--chart-grid') || '#1f2937',
    ok: cssVar('--ok') || '#34d399',
    fail: cssVar('--fail') || '#f87171',
  };
}

function renderChart(runs) {
  const ctx = document.getElementById('trendChart');
  const theme = chartTheme();
  const chronological = [...runs].reverse();
  const data = {
    labels: chronological.map((r) => formatDisplayDate(r.started_at || r.startedAt)),
    datasets: [
      { label: 'Passed', data: chronological.map((r) => num(r.passed)), borderColor: theme.ok, tension: 0.3 },
      { label: 'Failed', data: chronological.map((r) => num(r.failed)), borderColor: theme.fail, tension: 0.3 },
    ],
  };
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data,
    options: {
      plugins: { legend: { labels: { color: theme.label } } },
      scales: {
        x: { ticks: { color: theme.muted }, grid: { color: theme.grid } },
        y: { ticks: { color: theme.muted }, grid: { color: theme.grid }, beginAtZero: true },
      },
    },
  });
}

const RUN_TABLE_COLS = [
  { key: 'run-name', label: 'Run name', width: 220, min: 120 },
  { key: 'started', label: 'Started', width: 160, min: 120 },
  { key: 'browser', label: 'Browser', width: 90, min: 70 },
  { key: 'total', label: 'Total', width: 64, min: 52 },
  { key: 'pass', label: 'Pass', width: 64, min: 52 },
  { key: 'fail', label: 'Fail', width: 64, min: 52 },
  { key: 'status', label: 'Status', width: 80, min: 64 },
];

function runsTableHtml(rowsHtml, storageKey) {
  const colgroup = RUN_TABLE_COLS.map(
    (col) => `<col class="${col.key}" data-key="${col.key}" style="width:${col.width}px"/>`,
  ).join('');
  const head = RUN_TABLE_COLS.map(
    (col) =>
      `<th data-key="${col.key}">${col.label}<span class="col-resize" data-resize="${col.key}" title="Drag to resize"></span></th>`,
  ).join('');
  return `<div class="table-wrap" data-table-key="${storageKey}">
    <table class="runs-table">
      <colgroup>${colgroup}</colgroup>
      <thead><tr>${head}</tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="7" class="muted">No runs to show.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function loadColWidths(storageKey) {
  try {
    const raw = localStorage.getItem(`pw-bdd-cols:${storageKey}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveColWidths(storageKey, widths) {
  try {
    localStorage.setItem(`pw-bdd-cols:${storageKey}`, JSON.stringify(widths));
  } catch {
    /* ignore */
  }
}

function applySavedColWidths(wrap) {
  if (!wrap) return;
  const key = wrap.dataset.tableKey || 'runs';
  const saved = loadColWidths(key);
  wrap.querySelectorAll('colgroup col').forEach((col) => {
    const colKey = col.dataset.key;
    if (saved[colKey]) col.style.width = `${saved[colKey]}px`;
  });
}

function enableColumnResize(root) {
  (root || document).querySelectorAll('.table-wrap').forEach((wrap) => {
    applySavedColWidths(wrap);
    wrap.querySelectorAll('.col-resize').forEach((handle) => {
      if (handle.dataset.bound === '1') return;
      handle.dataset.bound = '1';
      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const colKey = handle.dataset.resize;
        const col = wrap.querySelector(`colgroup col[data-key="${colKey}"]`);
        const meta = RUN_TABLE_COLS.find((c) => c.key === colKey);
        if (!col || !meta) return;
        const startX = event.clientX;
        const startWidth = col.getBoundingClientRect().width;
        handle.classList.add('active');
        document.body.classList.add('col-resizing');

        function onMove(moveEvent) {
          const next = Math.max(meta.min, Math.round(startWidth + (moveEvent.clientX - startX)));
          col.style.width = `${next}px`;
        }

        function onUp() {
          handle.classList.remove('active');
          document.body.classList.remove('col-resizing');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          const widths = {};
          wrap.querySelectorAll('colgroup col').forEach((c) => {
            widths[c.dataset.key] = Math.round(c.getBoundingClientRect().width);
          });
          saveColWidths(wrap.dataset.tableKey || 'runs', widths);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  });
}

function runRow(run) {
  const id = run.id;
  const started = formatDisplayDate(run.started_at || run.startedAt);
  const name = runName(run);
  const selected = id === selectedRunId ? ' selected-run' : '';
  return `<tr class="${selected.trim()}">
    <td><button type="button" class="row" data-id="${escapeHtml(id)}" title="${escapeHtml(name)}">${escapeHtml(name)}</button></td>
    <td title="${escapeHtml(started)}">${escapeHtml(started)}</td>
    <td>${escapeHtml(titleCase(run.browser || ''))}</td>
    <td>${num(run.total)}</td>
    <td class="ok">${num(run.passed)}</td>
    <td class="fail">${num(run.failed)}</td>
    <td>${escapeHtml(run.status || '')}</td>
  </tr>`;
}

function renderRunsTables() {
  const runs = filteredRuns();
  const recentSource = selectedRunId ? runs : allRuns;
  const recent = pageSlice(recentSource, runsPage, pageSize);
  const all = pageSlice(runs, runsPage, pageSize);
  runsPage = all.page;

  document.getElementById('recentRuns').innerHTML =
    runsTableHtml(recent.items.map(runRow).join(''), 'recent') + pagerHtml('recent', recent);
  document.getElementById('runTable').innerHTML =
    runsTableHtml(all.items.map(runRow).join(''), 'all') + pagerHtml('runs', all);
  enableColumnResize(document);
  bindPagers(document);
}

function populateRunFilter() {
  const previous = selectedRunId;
  const options = [
    `<option value="">All runs (${allRuns.length})</option>`,
    ...allRuns.map((run) => {
      const label = shortLabel(runName(run), 72);
      const selected = run.id === previous ? ' selected' : '';
      return `<option value="${escapeHtml(run.id)}"${selected} title="${escapeHtml(runName(run))}">${escapeHtml(label)}</option>`;
    }),
  ];
  runFilter.innerHTML = options.join('');
  if (previous && allRuns.some((run) => run.id === previous)) {
    runFilter.value = previous;
  } else {
    runFilter.value = '';
    selectedRunId = '';
  }
}

async function applyRunFilter(options = {}) {
  selectedRunId = runFilter.value || '';
  runsPage = 1;
  failuresPage = 1;
  insightsPage = 1;

  const runs = filteredRuns();
  renderKpis(selectedRunId ? runs : allRuns);
  renderChart(selectedRunId ? runs : allRuns);
  renderRunsTables();

  const qs = selectedRunId ? `?runId=${encodeURIComponent(selectedRunId)}` : '';
  try {
    allFailures = await api(`/api/failures${qs}`);
    allInsights = await api(`/api/insights${qs}`);
  } catch (error) {
    allFailures = [];
    allInsights = [];
    console.error(error);
  }
  renderFailures(allFailures);
  renderInsights(allInsights);

  if (options.switchToFailures && selectedRunId) {
    document.querySelector('.nav[data-view="failures"]')?.click();
  }
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function syncThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const theme = currentTheme();
  btn.textContent = theme === 'light' ? 'Theme: Light' : 'Theme: Dark';
  btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
}

function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('pw-bdd-dashboard-theme', next);
  } catch {
    /* ignore */
  }
  syncThemeToggle();
  const runs = filteredRuns();
  renderChart(selectedRunId ? runs : allRuns);
}

function detectFlaky(runs) {
  const byName = {};
  runs.forEach((run) => {
    (run.scenarios || []).forEach((s) => {
      byName[s.name] = byName[s.name] || new Set();
      byName[s.name].add(s.status);
    });
  });
  const flaky = Object.entries(byName)
    .filter(([, set]) => set.has('failed') && set.has('passed'))
    .map(([name]) => name);
  document.getElementById('flaky').innerHTML = flaky.length
    ? `<ul>${flaky.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
    : '<p class="muted">No flaky scenarios in loaded history.</p>';
}

function shotThumb(src, alt) {
  if (!src) return '';
  return `<button type="button" class="shot-thumb" data-fullsrc="${escapeHtml(src)}" title="Click to view fullscreen">
    <img src="${escapeHtml(src)}" alt="${escapeHtml(alt || 'Screenshot')}" loading="lazy"/>
  </button>`;
}

function openLightbox(src, alt) {
  if (!src) return;
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  img.src = src;
  img.alt = alt || 'Fullscreen screenshot';
  lightbox.classList.add('open');
  lightbox.hidden = false;
  document.getElementById('lightboxClose').focus();
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  lightbox.classList.remove('open');
  lightbox.hidden = true;
  img.removeAttribute('src');
}

function bindShotThumbs(root) {
  (root || document).querySelectorAll('.shot-thumb').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const img = btn.querySelector('img');
      openLightbox(btn.getAttribute('data-fullsrc') || (img && img.src), img && img.alt);
    });
  });
}

(function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxClose = document.getElementById('lightboxClose');
  if (!lightbox) return;
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox || event.target === lightboxClose) closeLightbox();
  });
  lightboxImg.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
  });
})();

function renderFailures(items) {
  const root = document.getElementById('failureList');
  allFailures = Array.isArray(items) ? items : [];
  if (!allFailures.length) {
    root.innerHTML = '<div class="panel">No failures recorded for this filter.</div>';
    return;
  }
  const page = pageSlice(allFailures, failuresPage, pageSize);
  failuresPage = page.page;
  root.innerHTML =
    page.items
      .map((f) => {
        const name = f.name || f.scenario_id || 'Failed scenario';
        const code = f.errorCode || f.error_code || '';
        const category = f.errorCategory || f.error_category || '';
        const message = f.errorMessage || f.error_message || '';
        const locator = f.locator || '';
        const shot = f.screenshotPath || f.screenshot_path || '';
        const src = shot ? `/screenshots/${shot.split(/[/\\]/).pop()}` : '';
        return `<article class="fail-card panel">
          <h3>${escapeHtml(name)}</h3>
          <p class="meta">${escapeHtml(category)} · ${escapeHtml(code)}</p>
          <p>${escapeHtml(message)}</p>
          <p class="muted">Locator: ${escapeHtml(locator || 'n/a')}</p>
          ${shotThumb(src, 'Failure screenshot')}
        </article>`;
      })
      .join('') + pagerHtml('failures', page);
  bindShotThumbs(root);
  bindPagers(root);
}

function renderInsights(items) {
  const root = document.getElementById('insightList');
  allInsights = Array.isArray(items) ? items : [];
  if (!allInsights.length) {
    root.innerHTML =
      '<div class="panel">No AI insights yet. Set LLM_ENABLED=true and LLM_API_KEY, then click Run AI triage.</div>';
    return;
  }
  const page = pageSlice(allInsights, insightsPage, pageSize);
  insightsPage = page.page;
  root.innerHTML =
    page.items
      .map(
        (i) => `<article class="insight-card panel">
      <h3>${escapeHtml(i.category || 'unknown')} · ${escapeHtml(i.confidence || '')}${
          i.model ? ` · ${escapeHtml(i.model)}` : ''
        }</h3>
      <p>${escapeHtml(i.likelyCause || i.likely_cause || '')}</p>
      <p><strong>Fix:</strong> ${escapeHtml(i.suggestedFix || i.suggested_fix || '')}</p>
    </article>`,
      )
      .join('') + pagerHtml('insights', page);
  bindPagers(root);
}

async function load() {
  const health = await api('/api/health');
  const llm = health.llm
    ? health.llmReachable
      ? `on (${health.llmModel || 'model'})`
      : 'unreachable'
    : 'off';
  document.getElementById('health').textContent = `DB ${health.db ? 'on' : 'off'} · LLM ${llm}`;
  allRuns = await api('/api/runs');
  const detailed = [];
  for (const run of allRuns.slice(0, 20)) {
    detailed.push(await api(`/api/runs/${run.id}`));
  }
  populateRunFilter();
  detectFlaky(detailed);
  await applyRunFilter();
}

runFilter.addEventListener('change', () => {
  applyRunFilter().catch((error) => console.error(error));
});

document.addEventListener('click', (event) => {
  const rowBtn = event.target.closest('button.row[data-id]');
  if (!rowBtn) return;
  const id = rowBtn.getAttribute('data-id');
  if (!id) return;
  runFilter.value = id;
  applyRunFilter({ switchToFailures: false }).catch((error) => console.error(error));
});

document.getElementById('triageBtn').addEventListener('click', async () => {
  const btn = document.getElementById('triageBtn');
  btn.disabled = true;
  btn.textContent = 'Triaging...';
  try {
    await fetch('/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: runFilter.value || undefined }),
    });
    await load();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run AI triage';
  }
});

document.getElementById('themeToggle')?.addEventListener('click', () => {
  setTheme(currentTheme() === 'light' ? 'dark' : 'light');
});

syncThemeToggle();

load().catch((err) => {
  document.getElementById('kpis').innerHTML = `<div class="panel">Failed to load dashboard: ${escapeHtml(err.message)}</div>`;
});
