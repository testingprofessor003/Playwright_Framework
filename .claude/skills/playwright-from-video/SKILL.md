---
name: playwright-from-video
description: Generates Playwright Cucumber BDD tests, page objects, step definitions, and testdata factories from recorded UI videos, matching this framework's POM conventions. Use when the user attaches a screen recording, asks to generate Playwright from a video, or wants page objects created for screens in a recording.
---

# Playwright from video

Turn a recorded UI flow into tests that match this repo: Cucumber BDD, Page Object Model, `PlaywrightActions`, shared buffer, and Faker testdata.

Read [conventions.md](conventions.md) before writing files. Copy shapes from [templates.md](templates.md).

## Inputs

Source videos live in `recordings/recorded executions/` (not the recordings root, and not `recordings/test-runs/`).

Accept any of:

- An attached/dropped video (`.mp4`, `.webm`, `.mov`, `.mkv`)
- A path under `recordings/recorded executions/`
- A filename only (resolved from that folder)
- Screenshots plus a short description of the flow

If no video path is given:

1. Run `npm run generate:frames:list`
2. Read every video in `recordings/recorded executions/` (ignore `frames/`, `*.json`, and README)
3. If several videos exist, process each one (or ask which to use if the user named one)
4. Ask only if the folder is empty

Do not fetch from `recordings/test-runs/` — those are Playwright scenario videos from test execution.

## Workflow

Copy this checklist and complete it in order:

```
Task Progress:
- [ ] 1. Inspect video / extract frames
- [ ] 2. Map screens vs existing page objects
- [ ] 3. Write recordings/recorded executions/<slug>/screens.json
- [ ] 4. Create or extend page objects
- [ ] 5. Add testdata factory if the flow fills forms
- [ ] 6. Write feature + step definitions
- [ ] 7. Export pages and add an npm tag script
- [ ] 8. Dry-run Cucumber and fix undefined steps
```

### 1. Inspect the recording

1. Read the video with the Read tool when it is in the workspace or attached.
2. Extract stills so each distinct screen is a PNG:

```bash
npx tsx scripts/extract-video-frames.ts --video <filename-or-path>
```

Bare filenames are resolved from `recordings/recorded executions/`. List available files with `npm run generate:frames:list`.

3. Read the extracted frames in time order. Name each unique screen from visible headings, tabs, buttons, and URL chrome (for example `Login`, `AddCustomer`, `Customers`).

Do not invent controls that never appear. If a label is unreadable, use a role + accessible name guess and mark it `"confidence": "low"` in `screens.json`.

### 2. Reuse existing screens

Do **not** recreate these when the recording shows the same UI:

| Screen in video | Existing object | Existing steps |
| --- | --- | --- |
| Sign in / email / password | `src/pages/LoginPage.ts` | `features/steps/login.steps.ts` |
| Bank manager / Add Customer form | `src/pages/AddCustomerPage.ts` | `features/steps/customer.steps.ts` |
| Customers tab / search list | `src/pages/CustomersPage.ts` | `features/steps/customer.steps.ts` |
| Open Account | `src/pages/OpenAccountPage.ts` | `features/steps/customer.steps.ts` |
| Customer dashboard / deposit | `src/pages/CustomerDashboardPage.ts` | `features/steps/customer.steps.ts` |

New screens → new `src/pages/<Name>Page.ts`. Changed screens → extend the existing class; do not duplicate locators.

Canonical launch/login steps (reuse, do not redefine):

- `Given I launch the core banking application`
- `Given/And I reuse the saved bank manager session` — authenticated manager journeys (skips the login form after the first save)
- `When/And I sign in with valid credentials` — only when the scenario is testing UI login

### 3. Screen inventory

Write `recordings/recorded executions/<slug>/screens.json` before generating code. Schema:

```json
{
  "video": "recordings/recorded executions/example.mp4",
  "featureTag": "transfer",
  "featureFile": "features/transfer.feature",
  "reusedPages": ["LoginPage"],
  "screens": [
    {
      "id": "transfer-form",
      "name": "Transfer funds",
      "pageClass": "TransferPage",
      "pageFile": "src/pages/TransferPage.ts",
      "existing": false,
      "elements": [
        { "name": "Amount", "role": "textbox", "accessibleName": "Amount", "action": "fill", "xpath": "//input[@placeholder='Amount' or @aria-label='Amount' or @name='amount']" }
      ],
      "actions": ["openTransferTab", "enterAmount", "submitTransfer"],
      "assertions": ["assertTransferCompleted"]
    }
  ]
}
```

`pageClass` is `<ScreenName>Page`. One class per distinct screen/view, not per button.

### 4. Generate artifacts

For every **new** screen in `screens.json`:

1. `src/pages/<Name>Page.ts` — locators as private getters, business methods, `assert*` methods
2. Export it from `src/pages/index.ts`
3. If the screen is a form with generated data, add `src/testdata/<name>Factory.ts`

Then write the scenario layer:

4. `features/<slug>.feature` — Background for launch/login when the video starts signed-out
5. `features/steps/<slug>.steps.ts` — thin steps that call page objects; no locators in steps
6. A tagged npm script in `package.json` (`test:<slug>`) matching existing `test:customer` style

Follow [templates.md](templates.md) exactly for file shape.

### 5. Verify

```bash
npx cucumber-js --dry-run --tags "@<featureTag>" --format progress
```

Fix undefined/ambiguous steps before stopping. Do not run a full headed suite unless the user asks.

## Hard rules

- Locators live only in page objects. Steps construct the page with `(this.page, this.logger, this.context)`.
- Prefer `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText` → `getByTestId`. Always attach an XPath fallback with `this.byPreferredOrXPath(preferred, xpath)`. If those locators cannot be determined from the recording, use `this.xpath('//...')` only — never CSS as the last resort.
- Paths and commands must work on Windows, macOS, and Linux: repo-relative POSIX paths, `node:path`, `npm`/`npx` only.
- Drive the browser through `this.actions`, `this.waits`, `this.asserts` (or the page object's inherited helpers). Never call `page.click` / `page.fill` in new code.
- After any method that may open a window or change page, call `this.setPage(next)` in the page object and `this.setActivePage(...)` in the step.
- Credentials come from `requireAppCredentials()` / `.env`. Never hardcode passwords.
- Dynamic form values come from Faker factories, not literals copied from the video, unless the video is asserting a specific negative/validation value.
- Persist created entities in `this.shared` (`scenario` + `global` with ttl) when a later step needs them.
- Tags: feature tag plus `@smoke` / `@positive` / `@negative` / `@e2e` / `@regression` as they apply.
- Do not modify `features/templates/` or `src/pages/templates/` except to copy from them.

## Additional resources

- Framework file shapes: [templates.md](templates.md)
- Locator and coding rules: [conventions.md](conventions.md)
- Screen inventory example: [screens.example.json](screens.example.json)
- Live examples: `src/pages/AddCustomerPage.ts`, `features/customer.feature`, `features/steps/customer.steps.ts`
