# Framework conventions

Source of truth: existing files under `src/pages/`, `features/`, and `features/steps/`.

## Layout

| Artifact | Path |
| --- | --- |
| Page object | `src/pages/<Name>Page.ts` |
| Page barrel | `src/pages/index.ts` |
| Testdata | `src/testdata/<name>Factory.ts` |
| Feature | `features/<slug>.feature` |
| Steps | `features/steps/<slug>.steps.ts` |
| Screen inventory | `recordings/recorded executions/<slug>/screens.json` |
| Extracted frames | `recordings/recorded executions/<slug>/frames/` |

Cucumber already loads `features/**/*.feature` and `features/steps/**/*.ts` via `cucumber.js`. New files are picked up automatically.

## Page object rules

```ts
export class TransferPage extends BasePage {
  private get amountInput() {
    return this.byPreferredOrXPath(
      this.page.getByRole('textbox', { name: 'Amount' }),
      '//input[@placeholder="Amount" or @aria-label="Amount" or @name="amount"]',
    );
  }

  constructor(page: Page, logger: FrameworkLogger, context?: BrowserContext) {
    super(page, logger, context);
  }
}
```

- Class name: `<Screen>Page`, file name matches.
- Locators: `private get` (not constructor-assigned `locator()` fields) so they stay bound after `setPage`.
- Constructor always `(page, logger, context?)`.
- Every control uses `this.byPreferredOrXPath(preferred, xpath)`. If no role/label/placeholder/text/testid can be determined from the recording, use `this.xpath('//...')` only.
- Methods are user intents: `openTransferTab()`, `enterAmount(value)`, `submitTransfer()`, `assertTransferCompleted()`.
- Wait, then act: `await this.waits.visible(locator, 'Amount')` then `await this.actions.fill(...)`.
- Clicks that should not pause for observation: `{ observe: false }` (search boxes, intermediate fields).
- Logging: `this.logger.info(...)` for meaningful business actions.
- Assertions belong on the page (`assert*`) or `this.asserts.*`.

## Allowed action helpers

Use `PlaywrightActions` / `WaitConditions` / `Assertions` instead of raw Playwright:

- Navigate: `goto`, `launchApplication`, `launchApplicationInNewWindow`
- Pointer: `click`, `dblClick`, `hover`, `check`, `uncheck`, `scrollIntoView`
- Input: `fill`, `type`, `clear`, `select`, `selectRandom`, `press`, `pressOn`, `upload`
- Windows: `clickAndSwitchToNewWindow`, `clickAndSwitchToNewWindowIfOpened`, `switchToWindowByUrl`, `switchToParentWindow`
- Wait: `this.waits.visible|hidden|attached|enabled|url|loadState|observe|sleep|until`
- Assert: `this.asserts.visible|hidden|enabled|textContains|titleNotEmpty|urlContains|countEquals|isTrue|notEmpty`

## Step rules

```ts
When('I submit the transfer', { timeout: 60000 }, async function (this: CustomWorld) {
  const transferPage = new TransferPage(this.page, this.logger, this.context);
  await transferPage.submitTransfer();
  this.setActivePage(transferPage.getPage());
});
```

- Import `CustomWorld` and bind `this: CustomWorld`.
- No locators, CSS, or `page.getByRole` in step files.
- Set `{ timeout: 60000 }` (or higher for multi-step journeys).
- Reuse launch/login steps from `login.steps.ts`.
- Store created records:

```ts
await world.shared.set('transfer', data, { scope: 'scenario' });
await world.shared.set('lastTransfer', data, { scope: 'global', ttlMs: 30 * 60 * 1000 });
```

## Feature rules

```gherkin
@transfer
Feature: Transfer funds
  As a signed-in customer
  I want to move money between accounts
  So that I can complete everyday banking

  Background:
    Given I launch the core banking application
    And I reuse the saved bank manager session

  @smoke @positive
  Scenario: Transfer a random amount
    When I open the transfer form
    And I transfer a random amount
    Then the transfer should be completed
```

- One Feature per recording (or per business capability if the video covers several).
- Background = setup seen at the start of the video (usually launch + session).
- Use `I sign in with valid credentials` only when the scenario is testing the login UI itself.
- Use `I reuse the saved bank manager session` for journeys that need an already-authenticated manager (distinct from UI login).
- Scenario names describe outcome, not implementation.
- Scenario Outline + Examples for data-driven paths visible in the recording.
- Include at least one `@smoke @positive` happy path. Add `@negative` only when the video (or user) shows validation/error.

## Testdata

- Faker via `@faker-js/faker`, same style as `src/testdata/customerFactory.ts`.
- Export a type (`TransferData`) and `randomX()` / `xWith(overrides)`.
- Do not copy live PII from the recording into fixtures.

## Locator priority

1. `getByRole('button'|'textbox'|'tab'|'combobox'|'checkbox'|..., { name })`
2. `getByLabel`
3. `getByPlaceholder`
4. `getByText` / `getByAltText`
5. `getByTestId`
6. Filtered locator (`locator('div').filter({ hasText })`) as in `OpenAccountPage`
7. **XPath fallback** — always. Wrap the preferred locator with `this.byPreferredOrXPath(preferred, xpath)`. If none of 1–6 can be determined, use `this.xpath('//...')` alone. Do not use CSS as the last resort.

Store the XPath on each element in `screens.json` (`xpath`). Prefer stable attributes: `@id`, `@name`, `@aria-label`, `@placeholder`, `@data-testid`, `@type`, visible text via `normalize-space()`.

Use `exact: true` when the accessible name collides (see `LoginPage` Sign in).

## Operating systems

This skill and its scripts run on Windows, macOS, and Linux.

- Use repo-relative POSIX paths in generated files and docs (`recordings/recorded executions/my-flow.mp4`). Never hardcode `C:\`, `/Users/...`, or `\\`.
- Node scripts must use `node:path` (`join`, `resolve`). `ffmpeg` is resolved via `where` (Windows) or `which` (macOS/Linux).
- Commands the agent runs are `npm` / `npx` only — no PowerShell-only or bash-only scripts.

## Do not

- Put locators in `.feature` files or step definitions
- Hardcode secrets
- Recreate `LoginPage` / customer pages when the screen already exists
- Call `page.click` / `page.fill` / `page.goto` in new page objects
- Edit `features/templates/` or `src/pages/templates/` except as copy sources
