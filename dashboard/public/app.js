const views = document.querySelectorAll('.view');
const navButtons = document.querySelectorAll('.nav');
const viewTitle = document.getElementById('viewTitle');
const runFilter = document.getElementById('runFilter');
let trendChart;
let allRuns = [];

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

async function api(path) {
  const res = await fetch(path);
  return res.json();
}

function num(v) {
  return Number(v || 0);
}

function passRate(run) {
  const total = num(run.total);
  return total ? Math.round((num(run.passed) / total) * 100) : 0;
}

function renderKpis(runs) {
  const latest = runs[0] || { total: 0, passed: 0, failed: 0 };
  const avg =
    runs.length && runs.reduce((s, r) => s + passRate(r), 0) / runs.length;
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><b>${runs.length}</b><span class="muted">Historical runs</span></div>
    <div class="kpi"><b>${num(latest.total)}</b><span class="muted">Last run tests</span></div>
    <div class="kpi"><b class="fail">${num(latest.failed)}</b><span class="muted">Last run failures</span></div>
    <div class="kpi"><b class="ok">${Math.round(avg || 0)}%</b><span class="muted">Avg pass rate</span></div>`;
}

function renderChart(runs) {
  const ctx = document.getElementById('trendChart');
  const chronological = [...runs].reverse();
  const data = {
    labels: chronological.map((r) => formatDisplayDate(r.started_at || r.startedAt)),
    datasets: [
      { label: 'Passed', data: chronological.map((r) => num(r.passed)), borderColor: '#34d399', tension: 0.3 },
      { label: 'Failed', data: chronological.map((r) => num(r.failed)), borderColor: '#f87171', tension: 0.3 },
    ],
  };
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data,
    options: {
      plugins: { legend: { labels: { color: '#e5e7eb' } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1f2937' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: '#1f2937' }, beginAtZero: true },
      },
    },
  });
}

function runRow(run) {
  const id = run.id;
  const started = formatDisplayDate(run.started_at || run.startedAt);
  const name = runName(run);
  return `<tr>
    <td><button class="row" data-id="${id}">${name}</button></td>
    <td>${started}</td>
    <td>${titleCase(run.browser || '')}</td>
    <td>${num(run.total)}</td>
    <td class="ok">${num(run.passed)}</td>
    <td class="fail">${num(run.failed)}</td>
    <td>${run.status || ''}</td>
  </tr>`;
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
    ? `<ul>${flaky.map((n) => `<li>${n}</li>`).join('')}</ul>`
    : '<p class="muted">No flaky scenarios in loaded history.</p>';
}

function renderFailures(items) {
  const root = document.getElementById('failureList');
  if (!items.length) {
    root.innerHTML = '<div class="panel">No failures recorded.</div>';
    return;
  }
  root.innerHTML = items
    .map((f) => {
      const name = f.name || f.scenario_id || 'Failed scenario';
      const code = f.errorCode || f.error_code || '';
      const category = f.errorCategory || f.error_category || '';
      const message = f.errorMessage || f.error_message || '';
      const locator = f.locator || '';
      const shot = f.screenshotPath || f.screenshot_path || '';
      const img = shot ? `<img class="shot" src="/screenshots/${shot.split(/[/\\\\]/).pop()}" alt="screenshot"/>` : '';
      return `<article class="fail-card">
        <h3>${name}</h3>
        <p class="meta">${category} · ${code}</p>
        <p>${message}</p>
        <p class="muted">Locator: ${locator || 'n/a'}</p>
        ${img}
      </article>`;
    })
    .join('');
}

function renderInsights(items) {
  const root = document.getElementById('insightList');
  if (!items.length) {
    root.innerHTML = '<div class="panel">No AI insights yet. Set LLM_ENABLED=true and LLM_API_KEY, then click Run AI triage.</div>';
    return;
  }
  root.innerHTML = items
    .map((i) => `<article class="insight-card">
      <h3>${i.category || 'unknown'} · ${i.confidence || ''}${i.model ? ` · ${i.model}` : ''}</h3>
      <p>${i.likelyCause || i.likely_cause || ''}</p>
      <p><strong>Fix:</strong> ${i.suggestedFix || i.suggested_fix || ''}</p>
    </article>`)
    .join('');
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
  renderKpis(allRuns);
  renderChart(allRuns);
  document.getElementById('recentRuns').innerHTML = `<table><thead><tr><th>Run name</th><th>Started</th><th>Browser</th><th>Total</th><th>Pass</th><th>Fail</th><th>Status</th></tr></thead><tbody>${allRuns.slice(0, 8).map(runRow).join('')}</tbody></table>`;
  document.getElementById('runTable').innerHTML = `<table><thead><tr><th>Run name</th><th>Started</th><th>Browser</th><th>Total</th><th>Pass</th><th>Fail</th><th>Status</th></tr></thead><tbody>${allRuns.map(runRow).join('')}</tbody></table>`;
  runFilter.innerHTML = `<option value="">All runs</option>` + allRuns.map((r) => `<option value="${r.id}">${runName(r)}</option>`).join('');
  detectFlaky(detailed);
  renderFailures(await api('/api/failures'));
  renderInsights(await api('/api/insights'));
}

runFilter.addEventListener('change', async () => {
  const id = runFilter.value;
  const qs = id ? `?runId=${encodeURIComponent(id)}` : '';
  renderFailures(await api(`/api/failures${qs}`));
  renderInsights(await api(`/api/insights${qs}`));
});

document.getElementById('triageBtn').addEventListener('click', async () => {
  const btn = document.getElementById('triageBtn');
  btn.disabled = true;
  btn.textContent = 'Triaging...';
  await fetch('/api/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId: runFilter.value || undefined }),
  });
  btn.disabled = false;
  btn.textContent = 'Run AI triage';
  await load();
});

load().catch((err) => {
  document.getElementById('kpis').innerHTML = `<div class="panel">Failed to load dashboard: ${err.message}</div>`;
});
