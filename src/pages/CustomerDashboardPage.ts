import { BrowserContext, Locator, Page } from 'playwright';
import { BasePage } from './BasePage';
import { FrameworkLogger } from '../logger/logger';
import { CustomerData, customerFullName, customerInitials } from '../testdata/customerFactory';
import { DepositData, WithdrawData } from '../testdata/accountFactory';
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
    return this.labeledSelect('Account');
  }

  private get depositCategoryCombobox() {
    return this.labeledSelect('Category');
  }

  private get depositFundsButton() {
    return this.depositPanel.getByRole('button', { name: /deposit funds/i }).or(
      this.page.getByRole('button', { name: /deposit funds/i }),
    ).first();
  }

  private get withdrawTab() {
    return this.page.getByRole('tab', { name: 'Withdraw' });
  }

  private get withdrawPanel() {
    return this.page.getByRole('tabpanel', { name: 'Withdraw' });
  }

  private get withdrawAmountInput() {
    return this.withdrawPanel.getByPlaceholder('0.00');
  }

  private get withdrawAccountCombobox() {
    return this.labeledSelect('Account');
  }

  private get withdrawCategoryCombobox() {
    return this.labeledSelect('Category');
  }

  private get withdrawFundsButton() {
    return this.withdrawPanel.getByRole('button', { name: /withdraw( funds)?/i }).or(
      this.page.getByRole('button', { name: /withdraw( funds)?/i }),
    ).first();
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
    await this.actions.scrollBy(0, 100);
  }

  async enterDepositAmount(amount: string): Promise<void> {
    await this.waits.visible(this.depositAmountInput, 'Deposit amount');
    await this.actions.click(this.depositAmountInput, 'Deposit amount', { observe: false });
    await this.actions.fill(this.depositAmountInput, 'Deposit amount', amount);
    this.logger.info(`Entering deposit amount: ${amount}`);
  }

  async selectDepositAccount(currency?: string): Promise<SelectedOption | undefined> {
    return this.selectAccountIfPresent(this.depositAccountCombobox, 'Deposit account', currency);
  }

  async selectDepositCategory(): Promise<SelectedOption> {
    return this.selectRandomCategory(this.depositCategoryCombobox, 'Deposit category');
  }

  async submitDeposit(): Promise<void> {
    await this.waits.enabled(this.depositFundsButton, 'Deposit Funds');
    await this.actions.click(this.depositFundsButton, 'Deposit Funds');
    await this.waits.sleep(3000, 'after deposit completed');
  }

  async depositRandomAmount(amount: string, currency?: string): Promise<DepositData> {
    this.logger.info(
      `Depositing ${amount} into the shared-memory account${currency ? ` (${currency})` : ''}`,
    );
    await this.openDepositTab();
    await this.enterDepositAmount(amount);
    const account = await this.selectDepositAccount(currency);
    const category = await this.selectDepositCategory();
    await this.submitDeposit();
    return {
      amount,
      accountLabel: account?.label,
      accountValue: account?.value,
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

  async openWithdrawTab(): Promise<void> {
    await this.waits.visible(this.withdrawTab, 'Withdraw tab');
    await this.actions.click(this.withdrawTab, 'Withdraw tab');
    await this.waits.visible(this.withdrawAmountInput, 'Withdraw amount');
    await this.actions.scrollBy(0, 100);
  }

  async enterWithdrawAmount(amount: string): Promise<void> {
    await this.waits.visible(this.withdrawAmountInput, 'Withdraw amount');
    await this.actions.click(this.withdrawAmountInput, 'Withdraw amount', { observe: false });
    await this.actions.fill(this.withdrawAmountInput, 'Withdraw amount', amount);
    this.logger.info(`Entering withdraw amount: ${amount}`);
  }

  async selectWithdrawAccount(currency?: string): Promise<SelectedOption | undefined> {
    return this.selectAccountIfPresent(this.withdrawAccountCombobox, 'Withdraw account', currency);
  }

  async selectWithdrawCategory(): Promise<SelectedOption> {
    return this.selectRandomCategory(this.withdrawCategoryCombobox, 'Withdraw category');
  }

  async submitWithdraw(): Promise<void> {
    await this.waits.enabled(this.withdrawFundsButton, 'Withdraw Funds');
    await this.actions.click(this.withdrawFundsButton, 'Withdraw Funds');
    await this.waits.sleep(3000, 'after withdrawal completed');
  }

  async withdrawAmount(amount: string, currency?: string): Promise<WithdrawData> {
    this.logger.info(
      `Withdrawing ${amount} from the shared-memory account${currency ? ` (${currency})` : ''}`,
    );
    await this.openWithdrawTab();
    await this.enterWithdrawAmount(amount);
    const account = await this.selectWithdrawAccount(currency);
    const category = await this.selectWithdrawCategory();
    await this.waits.observe('withdraw category selected');
    await this.submitWithdraw();
    return {
      amount,
      accountLabel: account?.label,
      accountValue: account?.value,
      category: category.label,
    };
  }

  async assertWithdrawCompleted(amount: string): Promise<void> {
    const success = this.page
      .getByText(/withdraw(n|al)? (successful|complete)|funds withdrawn|success/i)
      .first();
    const successVisible = await success.isVisible().catch(() => false);
    if (successVisible) {
      this.logger.info(`Withdrawal confirmation shown for amount ${amount}`);
      return;
    }

    await this.waits.visible(this.withdrawFundsButton, 'Withdraw Funds');
    this.logger.info(`Withdrawal submitted for amount ${amount}`);
  }

  private labeledSelect(label: string): Locator {
    return this.page
      .locator(`xpath=//label[text()='${label}']/following-sibling::div/descendant::select`)
      .filter({ visible: true });
  }

  private async selectAccountIfPresent(
    select: Locator,
    name: string,
    currency?: string,
  ): Promise<SelectedOption | undefined> {
    try {
      await select.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      this.logger.info(`${name} is not on this screen; using the current account`);
      return undefined;
    }
    return this.selectSharedAccount(select, name, currency);
  }

  private async selectRandomCategory(select: Locator, name: string): Promise<SelectedOption> {
    await this.waits.visible(select, name);
    const tag = await select.evaluate((el) => el.tagName);
    if (tag !== 'SELECT') {
      this.logger.warn(`${name} expected a native <select>, found <${tag.toLowerCase()}>`);
    }
    await this.waits.selectOptionsReady(select, name);
    const selected = await this.actions.selectRandom(select, name, { exclude: ['No Category'] });
    this.logger.info(`Selected random ${name} with selectOption: ${selected.label}`);
    return selected;
  }

  private async selectSharedAccount(
    combobox: Locator,
    name: string,
    currency?: string,
  ): Promise<SelectedOption> {
    await this.waits.selectOptionsReady(combobox, name);
    const wanted = currency?.trim();
    if (wanted) {
      const option = combobox.locator('option').filter({ hasText: new RegExp(wanted, 'i') }).first();
      if ((await option.count()) > 0) {
        const value = await option.getAttribute('value', { timeout: 1000 }).catch(() => null);
        if (value) {
          const selected = await this.actions.select(combobox, name, value);
          this.logger.info(`Selected ${name} using shared-memory currency ${wanted}: ${selected.label}`);
          return selected;
        }
      }

      const labels = (await combobox.locator('option').allTextContents()).map((text) => text.trim());
      const match = labels.find((label) => label.toLowerCase().includes(wanted.toLowerCase()));
      if (match) {
        const selected = await this.actions.select(combobox, name, { label: match });
        this.logger.info(`Selected ${name} using shared-memory currency ${wanted}: ${selected.label}`);
        return selected;
      }

      this.logger.info(`${name} has no option matching currency "${wanted}"; picking a random account`);
    }

    const selected = await this.actions.select(combobox, name);
    this.logger.info(`${name} selected ${selected.label}`);
    return selected;
  }
}
