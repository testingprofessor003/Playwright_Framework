# Report viewing commands

Run tests first so artifacts exist. Most HTML reports are also generated at the end of a run.

Customized HTML UIs (Extent activity, custom failures, and the historical dashboard) show the **Testing Professor** logo from `src/reports/assets/testing-professor-logo.png` (copied next to each generated report). Browser tabs use the matching favicon (`testing-professor-favicon.png` / `favicon.ico`).

## Quick open

| Report | Command | File / URL |
| --- | --- | --- |
| Extent activity (steps, actions, screenshots, video, trace) | `npm run report:extent:open` | `reports/extent/latest.html` (archive: `index.html`) |
| Custom failures (mapped error + AI note) | `npm run report:custom:open` | `reports/custom/failures.html` |
| Cucumber HTML | open the file | `reports/cucumber-report.html` |
| Allure | `npm run allure:serve` | local Allure server |
| Historical dashboard | `npm run dashboard:start` | http://localhost:3000 |
| Playwright trace | see [Traces](#traces) | `reports/traces/*.zip` |

## Extent activity report

Step log, Playwright actions, step screenshots, scenario screenshot, video, and trace download.

```bash
npm run report:extent
npm run report:extent:open
```

Or open `reports/extent/latest.html` for the newest run, or `reports/extent/index.html` for the archive of every execution (`reports/extent/history/<run-id>.html`). Screenshots are embedded as Base64 data-URIs in each HTML file (shareable as a single file). Videos/traces are copied under `reports/extent/videos|traces/` for `file://` access.

With `SCREENSHOT=on` (or `retain-on-failure` on failures), scenario screenshots appear in the Extent detail pane and under Allure **After** fixtures.

## Custom failure report

Mapped error code, locator, screenshot, and AI triage (after `ai:triage`).

```bash
npm run report:custom
npm run report:custom:open
npm run report:open
```

`report:open` only opens an already generated `reports/custom/failures.html`.

## Cucumber HTML / JSON

Written automatically during the run.

```bash
# HTML
reports/cucumber-report.html

# JSON
reports/cucumber-report.json
```

## Allure

```bash
npm run allure:generate
npm run allure:open
```

Generate and serve in one step:

```bash
npm run allure:serve
```

Output folder after generate: `reports/allure-report/`. Raw results: `reports/allure-results/`.

## Historical dashboard

Trends, run list, failures, flaky tests, AI insights.

```bash
npm run dashboard:start
```

Open http://localhost:3000

Use **Run AI triage** on the dashboard, or:

```bash
npm run ai:triage
```

Then refresh the **AI Insights** tab.

## Traces

Requires `TRACE=on` or a failed scenario with `TRACE=retain-on-failure`.

```bash
npx playwright show-trace reports/traces/<file>.zip
```

Trace zips are also linked from the Extent test detail page.

## Videos and screenshots

| Artifact | Folder | When |
| --- | --- | --- |
| Scenario screenshot | `reports/screenshots/` | `SCREENSHOT=on` or `retain-on-failure` |
| Step screenshots | `reports/screenshots/steps/` | `STEP_SCREENSHOT=on` or `retain-on-failure` |
| Action screenshots | `reports/screenshots/actions/` | `ACTION_SCREENSHOT=on` or `retain-on-failure` |
| Video | `recordings/test-runs/` | `VIDEO=on` or `retain-on-failure` |
| Trace | `reports/traces/` | `TRACE=on` or `retain-on-failure` |

Open images/videos from those folders, from Extent (`npm run report:extent:open`), or from Allure (`npm run allure:serve`) when `SCREENSHOT` / `STEP_SCREENSHOT` / `ACTION_SCREENSHOT` is enabled.

## Generate everything after a run

```bash
npm run report:all
```

This generates Allure, the custom failure HTML, Extent, and runs LLM triage when `LLM_ENABLED=true`.

Then open:

```bash
npm run allure:open
npm run report:custom:open
npm run report:extent:open
npm run dashboard:start
```

## Design docs (HLD / LLD)

```bash
npm run docs:pdf
```

Open in a browser:

- `docs/hld.html`
- `docs/lld.html`
- `docs/hld.pdf`
- `docs/lld.pdf`

## Clean reports

```bash
npm run clean:reports
```

Deletes `reports/` and recreates an empty folder. Run tests again before viewing reports.
