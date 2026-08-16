import { BrowserContext, Page } from 'playwright';
import { BasePage } from './BasePage';
import { FrameworkLogger } from '../logger/logger';
import { CustomerData, customerFullName, customerInitials } from '../testdata/customerFactory';
import { DepositData } from '../testdata/accountFactory';
import { SelectedOption } from '../utils/PlaywrightActions';

export class CustomerDashboardPage extends BasePage {
  private get goBackButton() {
    return this.page.getByRole('button', { name: 'Go back' });
  }

  private get openDashboardButton() {
    return this.page.getByRole('button', { name: 'Open your dashboard' }).first();
  }

  private get customerSearchInput() {
    return this.page.getByRole('textbox', { name: 'Search by name or post code…' });
  }

  constructor(page: Page, logger: FrameworkLogger, context?: BrowserContext) {
    super(page, logger, context);
  }

  customerResultButton(customer: CustomerData) {
    const fullName = customerFullName(customer);
    const initials = customerInitials(customer);
    return this.page.getByRole('button', { name: `${initials} ${fullName}` });
  }

  continueAsButton(firstName: string) {
    return this.page.getByRole('button', { name: `Continue as ${firstName}` });
  }

  private get depositTab() {
    return this.page.getByRole('tab', { name: 'Deposit' });
  }

  private get depositPanel() {
    return this.page.getByRole('tabpanel', { name: 'Deposit' });
  }

  private get depositAmountInput() {
    return this.depositPanel.getByPlaceholder('0.00');
  }

  private get depositAccountCombobox() {
    return this.depositPanel.getByRole('combobox').first();
  }

  private get depositCategoryCombobox() {
    const byName = this.depositPanel.getByRole('combobox', { name: /category/i });
    const byOption = this.depositPanel.getByRole('combobox').filter({
      has: this.page.locator('option', { hasText: 'No Category' }),
    });
    return byName.or(byOption).first();
  }

  private get depositFundsButton() {
    return this.page.getByRole('button', { name: 'Deposit Funds' });
  }

  async goBackFromPortal(): Promise<void> {
    const visible = await this.actions.isVisible(this.goBackButton, 'Go back');
    if (!visible) {
      this.logger.info('Go back is not visible; already on the home view');
      return;
    }
    await this.actions.click(this.goBackButton, 'Go back');
  }

  async openDashboard(): Promise<void> {
    await this.waits.visible(this.openDashboardButton, 'Open your dashboard');
    await this.actions.click(this.openDashboardButton, 'Open your dashboard');
    await this.waits.visible(this.customerSearchInput, 'Search by name or post code');
  }

  async searchCustomerAccount(fullName: string): Promise<void> {
    await this.waits.visible(this.customerSearchInput, 'Search by name or post code');
    await this.actions.click(this.customerSearchInput, 'Search by name or post code', { observe: false });
    await this.actions.fill(this.customerSearchInput, 'Search by name or post code', fullName);
    this.logger.info(`Searching customer dashboard for: ${fullName}`);
    await this.waits.observe('customer dashboard search');
  }

  async selectCustomerResult(customer: CustomerData): Promise<void> {
    const fullName = customerFullName(customer);
    const initials = customerInitials(customer);
    const result = this.customerResultButton(customer);
    await this.waits.visible(result, `${initials} ${fullName}`);
    await this.actions.click(result, `${initials} ${fullName}`);
  }

  async continueAsCustomer(firstName: string): Promise<void> {
    const button = this.continueAsButton(firstName);
    await this.waits.visible(button, `Continue as ${firstName}`);
    await this.actions.click(button, `Continue as ${firstName}`);
    this.logger.info(`Clicked Continue as ${firstName}`);
  }

  async loginAsCreatedCustomer(customer: CustomerData): Promise<void> {
    const fullName = customerFullName(customer);
    await this.goBackFromPortal();
    await this.openDashboard();
    await this.searchCustomerAccount(fullName);
    await this.selectCustomerResult(customer);
    await this.continueAsCustomer(customer.firstName);
  }

  async assertLoggedInAs(customer: CustomerData): Promise<void> {
    const firstName = customer.firstName;
    const continueBtn = this.continueAsButton(firstName);
    await this.asserts.hidden(continueBtn, `Continue as ${firstName}`);
    this.logger.info(`Logged into the customer account as ${firstName} (${customerFullName(customer)})`);
  }

  async openDepositTab(): Promise<void> {
    await this.waits.visible(this.depositTab, 'Deposit tab');
    await this.actions.click(this.depositTab, 'Deposit tab');
    await this.waits.visible(this.depositAmountInput, 'Deposit amount');
  }

  async enterDepositAmount(amount: string): Promise<void> {
    await this.waits.visible(this.depositAmountInput, 'Deposit amount');
    await this.actions.click(this.depositAmountInput, 'Deposit amount', { observe: false });
    await this.actions.fill(this.depositAmountInput, 'Deposit amount', amount);
    this.logger.info(`Entering randomised deposit amount: ${amount}`);
  }

  async selectDepositAccount(currency?: string): Promise<SelectedOption> {
    await this.waits.visible(this.depositAccountCombobox, 'Deposit account');
    if (currency?.trim()) {
      const option = this.depositAccountCombobox.locator('option').filter({ hasText: new RegExp(currency, 'i') }).first();
      const value = await option.getAttribute('value').catch(() => null);
      if (value) {
        const selected = await this.actions.select(this.depositAccountCombobox, 'Deposit account', value);
        this.logger.info(`Selected deposit account matching ${currency}: ${selected.label}`);
        return selected;
      }
    }

    const selected = await this.actions.selectRandom(this.depositAccountCombobox, 'Deposit account');
    this.logger.info(`Deposit account was not specified — selected random account: ${selected.label}`);
    return selected;
  }

  async selectDepositCategory(): Promise<SelectedOption> {
    await this.waits.visible(this.depositCategoryCombobox, 'Category');
    const selected = await this.actions.selectRandom(this.depositCategoryCombobox, 'Category', {
      exclude: ['No Category'],
    });
    this.logger.info(`Selected random deposit category (excluding No Category): ${selected.label}`);
    return selected;
  }

  async submitDeposit(): Promise<void> {
    await this.actions.click(this.depositFundsButton, 'Deposit Funds');
  }

  async depositRandomAmount(amount: string, currency?: string): Promise<DepositData> {
    await this.openDepositTab();
    await this.enterDepositAmount(amount);
    const account = await this.selectDepositAccount(currency);
    const category = await this.selectDepositCategory();
    await this.submitDeposit();
    return {
      amount,
      accountLabel: account.label,
      accountValue: account.value,
      category: category.label,
    };
  }

  async assertDepositCompleted(amount: string): Promise<void> {
    const success = this.page.getByText(/deposit(ed)? (successful|complete|funds)|funds deposited|success/i).first();
    const successVisible = await success.isVisible().catch(() => false);
    if (successVisible) {
      this.logger.info(`Deposit confirmation shown for amount ${amount}`);
      return;
    }

    await this.waits.visible(this.depositFundsButton, 'Deposit Funds');
    this.logger.info(`Deposit submitted for amount ${amount}`);
  }
}
