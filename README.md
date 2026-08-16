# Playwright BDD Cucumber Framework

TypeScript automation platform: Playwright + Cucumber BDD, Page Object Model, Allure, custom historical dashboard, MySQL/PostgreSQL, BrowserStack, Docker/Jenkins/GitHub Actions, and local Ollama failure triage.

## Prerequisites

- Node.js 24 LTS+
- Playwright 1.62.1 browsers (`npm run install:browsers`)
- TypeScript 7 (runtime via `tsx`; `ts-node` is not used)
- Optional: MySQL 8 or PostgreSQL 16, [Ollama](https://ollama.com) with a pulled model (`ollama pull llama3.1`)
- Optional: BrowserStack username and access key

## Quick start

```bash
copy .env.example .env
npm install
npm run install:browsers
npm test
```

Open reports — full command list is in [REPORTS.md](REPORTS.md):

- Cucumber HTML: `reports/cucumber-report.html`
- Extent: `npm run report:extent:open`
- Custom failures: `npm run report:custom:open`
- Allure: `npm run allure:generate && npm run allure:open`
- Dashboard: `npm run dashboard:start` → http://localhost:3000

## Adding a real page

1. Copy `src/pages/templates/ExamplePage.ts` and replace locators.
2. Export it from `src/pages/index.ts`.
3. Add `features/<name>.feature` and `features/steps/<name>.steps.ts`.
4. Use `this.actions` or the page object from Cucumber steps.

Or drop a screen recording in `recordings/recorded executions/` and ask the Cursor or Claude agent to generate Playwright from the video. It fetches files from that folder, creates one page object per new screen, reuses login/customer objects when those screens appear, and adds the feature plus steps. See [recordings/README.md](recordings/README.md).

Details are in [docs/hld.html](docs/hld.html) and [docs/lld.html](docs/lld.html). Generate PDFs with `npm run docs:pdf`.

## GitHub Actions CI

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

Default AUT is `https://corebanking.testingprofessor.net/` (override with repo variable `BASE_URL`). Smoke runs use `@smoke and not @example` against Chromium, Firefox, and WebKit.

**Required repository secrets**

| Secret | Purpose |
| --- | --- |
| `APP_USERNAME` | Core banking login email |
| `APP_PASSWORD` | Plain password, or `enc.v1...` if you also set `APP_ENCRYPTION_KEY` |
| `APP_ENCRYPTION_KEY` | Optional; only when `APP_PASSWORD` is encrypted |
| `BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY` | Optional; BrowserStack job via workflow_dispatch |

CI sets `LLM_ENABLED=false`. `OLLAMA_ENABLED` is the same switch (an alias), not a second flag. Headed pauses are disabled (`LOGIN_PAUSE_MS=0`, `CLICK_PAUSE_MS=0`).

## Self-healing locators

Disabled by default. When a click/fill/wait fails with an element/timeout error, the action layer can try alternatives:

```bash
# .env
SELF_HEAL_ENABLED=true
SELF_HEAL_USE_LLM=false          # set true to ask the LLM after heuristics (needs LLM_ENABLED + LLM_API_KEY)
SELF_HEAL_TIMEOUT_MS=2500
```

Order: remembered heal cache → role/text/placeholder/label/css heuristics → optional LLM. Successful heals are stored under `reports/self-heal/healed-locators.json` and logged in Extent as `selfHeal` activities.

## Shared buffer (parallel / cross-browser)

```ts
await this.shared.set('orderId', value, { scope: 'global', ttlMs: 600000 });
const orderId = await this.shared.get('orderId', 'global');
```

Scopes: `scenario` (World), `worker` (process), `global` (locked JSON file + optional DB `shared_kv`).

## Database

```bash
# .env
DB_ENABLED=true
DB_TYPE=mysql   # or postgres
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=playwright_framework

npm run db:migrate
```

If the database is down, tests still run and history is stored under `reports/history/`.

## Local LLM triage

The framework talks to `http://localaiserver.testingprofessor.net` over the Ollama API (`/api/tags`, `/api/chat`). The server requires an API key.

`llama3` lists installed models (including parameter size from Ollama) and picks one by task complexity. Complex failure analysis prefers a **~32B** model when one is installed (`qwen2.5:32b`, `llama3.1:32b`, and similar), then `gemma4:latest`. Simple classification prefers a small llama3* model, not a 32B model.

```bash
# .env
LLM_ENABLED=true
LLM_HOST=http://localaiserver.testingprofessor.net
LLM_MODEL=auto
LLM_ROUTER_MODEL=llama3
LLM_COMPLEX_MODEL=gemma4:latest
LLM_PREFER_BILLION=32
LLM_ROUTE=true
LLM_API=ollama
LLM_API_KEY=your-api-key

npm run ai:health
npm run ai:triage
```

Set `LLM_ROUTE=false` and `LLM_MODEL=gemma4:latest` to always use Gemma. `OLLAMA_ENABLED` is the same flag as `LLM_ENABLED`; `OLLAMA_HOST`, `OLLAMA_MODEL`, and `OLLAMA_API_KEY` alias the matching `LLM_*` names.

## Manager session reuse

These are different steps on purpose:

- `I sign in with valid credentials` — always types email and password in the UI (`login.feature`).
- `I reuse the saved bank manager session` — loads Playwright `storageState` from `reports/.auth/bank-manager.json`. The first scenario in a run that hits this step signs in through the UI once and saves the file; later scenarios skip the login form.

Customer Background uses the reuse step, then opens the bank manager portal.

## BrowserStack

```bash
# .env
EXECUTION_ENV=browserstack
BROWSERSTACK_USERNAME=...
BROWSERSTACK_ACCESS_KEY=...

npm run test:browserstack
```

## Docker

```bash
npm run docker:up
npm run docker:test
```

## npm scripts

| Script | Purpose |
| --- | --- |
| `test`, `test:chrome`, `test:firefox`, `test:webkit` | Browsers |
| `test:all-browsers` | Sequential engines |
| `test:headed`, `test:debug`, `test:slow`, `test:trace` | Debug |
| `test:parallel` | 4 workers |
| `test:smoke`, `test:tags` | Tag filters |
| `codegen`, `codegen:url`, `codegen:mobile` | Playwright recorder |
| `generate:frames` | Extract stills from a UI recording in `recordings/recorded executions/` |
| `generate:frames:list` | List videos in `recordings/recorded executions/` |
| `allure:generate`, `allure:open` | Allure |
| `report:custom`, `report:all` | Failure HTML + AI |
| `dashboard:start`, `db:migrate` | Ops |
| `test:browserstack` | Cloud |
| `docs:pdf` | HLD/LLD PDF |

Codegen against a URL:

```bash
npm run codegen:url --url=https://example.com --browser=chromium
```
