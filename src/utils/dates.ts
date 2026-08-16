export function nowIso(): string {
  return new Date().toISOString();
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Display format: dd-MM-yyyy hh-mm-ss */
export function formatDisplayDate(value?: string | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()} ${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
}

export function titleCase(value: string): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function buildRunName(browser: string, environment: string, at: Date = new Date(), scenarioNames: string[] = []): string {
  const base = `${titleCase(browser)} ${titleCase(environment)} ${formatDisplayDate(at)}`;
  const scenarios = scenarioNames.map((name) => name.trim()).filter(Boolean);
  if (!scenarios.length) {
    return base;
  }
  const label = scenarios.length <= 2 ? scenarios.join(', ') : `${scenarios[0]} +${scenarios.length - 1} more`;
  return `${label} | ${base}`;
}

export function buildRunId(browser: string, environment: string, at: Date = new Date()): string {
  return `${browser.toLowerCase()}-${environment.toLowerCase()}-${formatDisplayDate(at).replace(/ /g, '-')}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds % 60).toFixed(0);
  return `${minutes}m ${rest}s`;
}

export function stamp(): string {
  return formatDisplayDate(new Date()).replace(/ /g, '_');
}

