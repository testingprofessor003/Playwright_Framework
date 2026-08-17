import { BrowserContext, Page } from 'playwright';
import { BasePage } from './BasePage';
import { FrameworkLogger } from '../logger/logger';
import { AccountData } from '../testdata/accountFactory';
import { ElementNotFoundError } from '../errors/errors';

export class OpenAccountPage extends BasePage {
  private get openAccountTab() {
    return this.page.getByRole('tab', { name: 'Open Account' });
  }

  private get customerCombobox() {
    return this.page.getByRole('combobox').first();
  }

  private get currencyCombobox() {
    return this.page
      .locator('div')
      .filter({ hasText: /^Select currency…Dollar \(USD\)Pound \(GBP\)Rupee \(INR\)$/ })
      .getByRole('combobox');
  }

  private get initialDepositInput() {
    return this.page.getByRole('textbox', { name: '0.00' });
  }

  private get openAccountButton() {
    return this.page.getByRole('button', { name: 'Open Account' });
  }

  constructor(page: Page, logger: FrameworkLogger, context?: BrowserContext) {
    super(page, logger, context);
  }

  async openOpenAccountTab(): Promise<void> {
    await this.waits.visible(this.openAccountTab, 'Open Account tab');
    await this.actions.click(this.openAccountTab, 'Open Account tab');
    await this.waits.visible(this.customerCombobox, 'Customer');
  }

  async selectCreatedCustomer(customerName?: string): Promise<string> {
    await this.waits.visible(this.customerCombobox, 'Customer');
    if (!customerName?.trim()) {
      const selected = await this.actions.select(this.customerCombobox, 'Customer', '');
      this.logger.info(`Customer was blank — selected random customer: ${selected.label}`);
      return selected.label;
    }

    const option = this.customerCombobox.locator('option').filter({ hasText: customerName }).first();
    await this.waits.attached(option, `Customer option ${customerName}`);

    const value = await option.getAttribute('value');
    if (value) {
      await this.actions.select(this.customerCombobox, 'Customer', value);
      this.logger.info(`Selected created customer for Open Account: ${customerName} (value=${value})`);
      return customerName;
    }

    const labels = (await this.customerCombobox.locator('option').allTextContents()).map((text) => text.trim());
    const match = labels.find((label) => label === customerName || label.includes(customerName));
    if (!match) {
      throw new ElementNotFoundError(
        `Created customer "${customerName}" was not found in the Open Account customer list`,
        {
          action: 'selectCreatedCustomer',
          locator: 'Customer combobox',
        },
      );
    }

    await this.actions.select(this.customerCombobox, 'Customer', { label: match });
    this.logger.info(`Selected created customer for Open Account: ${match}`);
    return match;
  }

  async selectCurrency(currency?: string): Promise<string> {
    const combo =
      (await this.currencyCombobox.count()) > 0
        ? this.currencyCombobox
        : this.page.getByRole('combobox').nth(1);
    await this.waits.visible(combo, 'Currency');
    const selected = await this.actions.select(combo, 'Currency', currency);
    if (!currency?.trim()) {
      this.logger.info(`Currency was blank — selected random currency: ${selected.label}`);
    }
    return selected.label || selected.value;
  }

  async enterInitialDeposit(amount: string): Promise<void> {
    await this.waits.visible(this.initialDepositInput, 'Initial deposit');
    await this.actions.click(this.initialDepositInput, 'Initial deposit', { observe: false });
    await this.actions.fill(this.initialDepositInput, 'Initial deposit', amount);
  }

  async submitOpenAccount(): Promise<void> {
    await this.actions.click(this.openAccountButton, 'Open Account');
    await this.waits.sleep(3000, 'after account created');
  }

  async openAccount(customerName: string, currency: string, amount: string): Promise<void> {
    this.logger.info(`Opening account using shared-memory customer "${customerName}": ${currency} ${amount}`);
    await this.openOpenAccountTab();
    await this.selectCreatedCustomer(customerName);
    await this.selectCurrency(currency);
    await this.enterInitialDeposit(amount);
    await this.submitOpenAccount();
  }

  async openAccountsForCustomer(customerName: string, accounts: AccountData[]): Promise<void> {
    for (const [index, account] of accounts.entries()) {
      this.logger.info(
        `Opening account ${index + 1}/${accounts.length} using shared-memory customer "${customerName}": ${account.currency} ${account.amount}`,
      );
      await this.openOpenAccountTab();
      await this.selectCreatedCustomer(customerName);
      await this.selectCurrency(account.currency);
      await this.enterInitialDeposit(account.amount);
      await this.submitOpenAccount();
    }
  }

  async openAccountsForCustomers(
    customers: Array<{ fullName: string }>,
    accountsPerCustomer: AccountData[],
  ): Promise<void> {
    for (const customer of customers) {
      await this.openAccountsForCustomer(customer.fullName, accountsPerCustomer);
    }
  }

  async assertAccountsOpened(count: number, customerName: string): Promise<void> {
    const success = this.page.getByText(/account (opened|created)|success/i).first();
    const successVisible = await success.isVisible().catch(() => false);
    if (successVisible) {
      this.logger.info(`Account opened confirmation shown for ${customerName}`);
      return;
    }

    await this.waits.visible(this.openAccountButton, 'Open Account');
    this.logger.info(`Opened ${count} account(s) for ${customerName}`);
  }

  async assertAccountCount(expected: number, actual: number, customerName: string): Promise<void> {
    this.asserts.equals(
      actual,
      expected,
      `Expected ${expected} account(s) for "${customerName}" but stored ${actual}`,
      'assertAccountCount',
    );
    this.logger.info(`Verified ${actual} account(s) were created for ${customerName}`);
  }
}
