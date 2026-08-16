function pad(value) {
  return String(value).padStart(2, '0');
}

function formatRunStamp(date) {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function titleCase(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

const parallel = parseInt(process.env.PARALLEL || '1', 10);

if (!process.env.RUN_ID) {
  const started = new Date();
  const browser = (process.env.BROWSER || 'chrome').toLowerCase();
  const execution = (process.env.EXECUTION_ENV || 'local').toLowerCase();
  const stamp = formatRunStamp(started);
  process.env.RUN_NAME = `${titleCase(browser)} ${titleCase(execution)} ${stamp}`;
  process.env.RUN_ID = `${browser}-${execution}-${stamp.replace(/ /g, '-')}`;
}

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'src/config/env.ts',
      'src/world/CustomWorld.ts',
      'src/hooks/hooks.ts',
      'features/steps/**/*.ts',
    ],
    paths: ['features/**/*.feature'],
    format: [
      'progress-bar',
      'html:reports/cucumber-report.html',
      'json:reports/cucumber-report.json',
      // Cucumber keeps only one stdout formatter; give Allure a file target so it is not dropped.
      ['allure-cucumberjs/reporter', 'reports/allure-results/.formatter-output'],
      './src/reports/extent/ExtentFormatter.js',
    ],
    formatOptions: {
      snippetInterface: 'async-await',
      resultsDir: process.env.ALLURE_RESULTS_DIR || 'reports/allure-results',
    },
    parallel: Number.isNaN(parallel) ? 1 : parallel,
    retry: parseInt(process.env.RETRY || '0', 10),
    timeout: parseInt(process.env.CUCUMBER_TIMEOUT || '60000', 10),
  },
};
