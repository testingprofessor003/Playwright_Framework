# File templates

Replace `Transfer` / `transfer` with the screen slug from `screens.json`.

## Page object — `src/pages/TransferPage.ts`

```ts
import { BrowserContext, Page } from 'playwright';
import { BasePage } from './BasePage';
import { FrameworkLogger } from '../logger/logger';
import { TransferData } from '../testdata/transferFactory';

export class TransferPage extends BasePage {
  private get transferTab() {
    return this.byPreferredOrXPath(
      this.page.getByRole('tab', { name: 'Transfer' }),
      '//*[@role="tab" and (normalize-space()="Transfer" or @aria-label="Transfer")]',
    );
  }

  private get amountInput() {
    return this.byPreferredOrXPath(
      this.page.getByRole('textbox', { name: 'Amount' }),
      '//input[@placeholder="Amount" or @aria-label="Amount" or @name="amount"]',
    );
  }

  private get submitButton() {
    return this.byPreferredOrXPath(
      this.page.getByRole('button', { name: 'Transfer' }),
      '//button[normalize-space()="Transfer" or @aria-label="Transfer"]',
    );
  }

  constructor(page: Page, logger: FrameworkLogger, context?: BrowserContext) {
    super(page, logger, context);
  }

  async openTransferTab(): Promise<void> {
    await this.waits.visible(this.transferTab, 'Transfer tab');
    await this.actions.click(this.transferTab, 'Transfer tab');
    await this.waits.visible(this.amountInput, 'Amount');
  }

  async fillTransfer(data: TransferData): Promise<void> {
    this.logger.info(`Filling transfer amount ${data.amount}`);
    await this.waits.visible(this.amountInput, 'Amount');
    await this.actions.click(this.amountInput, 'Amount', { observe: false });
    await this.actions.fill(this.amountInput, 'Amount', data.amount);
  }

  async submitTransfer(): Promise<void> {
    await this.actions.click(this.submitButton, 'Transfer');
  }

  async assertTransferCompleted(): Promise<void> {
    const confirmation = this.byPreferredOrXPath(
      this.page.getByText(/transfer (completed|successful)|success/i).first(),
      '//*[contains(normalize-space(), "success") or contains(normalize-space(), "completed")]',
    );
    await this.asserts.visible(confirmation, 'Transfer confirmation');
  }
}
```

Export from `src/pages/index.ts`:

```ts
export { TransferPage } from './TransferPage';
```

## Testdata — `src/testdata/transferFactory.ts`

```ts
import { faker } from '@faker-js/faker';

export interface TransferData {
  amount: string;
}

export function randomTransfer(): TransferData {
  return {
    amount: String(faker.number.int({ min: 100, max: 5000 })),
  };
}

export function transferWith(overrides: Partial<TransferData> = {}): TransferData {
  return { ...randomTransfer(), ...overrides };
}
```

## Feature — `features/transfer.feature`

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

## Steps — `features/steps/transfer.steps.ts`

```ts
import { Then, When } from '@cucumber/cucumber';
import { CustomWorld } from '../../src/world/CustomWorld';
import { TransferPage } from '../../src/pages/TransferPage';
import { randomTransfer, TransferData } from '../../src/testdata/transferFactory';

const SHARED_TTL = { ttlMs: 30 * 60 * 1000 };

When('I open the transfer form', { timeout: 60000 }, async function (this: CustomWorld) {
  const transferPage = new TransferPage(this.page, this.logger, this.context);
  await transferPage.openTransferTab();
  this.setActivePage(transferPage.getPage());
});

When('I transfer a random amount', { timeout: 120000 }, async function (this: CustomWorld) {
  const data = randomTransfer();
  const transferPage = new TransferPage(this.page, this.logger, this.context);
  await transferPage.fillTransfer(data);
  await transferPage.submitTransfer();
  await this.shared.set('transfer', data, { scope: 'scenario' });
  await this.shared.set('lastTransfer', data, { scope: 'global', ...SHARED_TTL });
  this.setActivePage(transferPage.getPage());
});

Then('the transfer should be completed', { timeout: 60000 }, async function (this: CustomWorld) {
  const transferPage = new TransferPage(this.page, this.logger, this.context);
  transferPage.setPage(this.page);
  await transferPage.assertTransferCompleted();
});
```

## npm script

Add beside the existing `test:customer*` scripts:

```json
"test:transfer": "cross-env BROWSER=chrome BROWSER_CHANNEL=chrome HEADLESS=false LOGIN_PAUSE_MS=3000 SLOW_MO=0 KEEP_BROWSER_OPEN=false cucumber-js --tags \"@transfer\""
```
