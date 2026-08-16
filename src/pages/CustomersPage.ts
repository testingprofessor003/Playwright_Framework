import { BrowserContext, Page } from 'playwright';
import { BasePage } from './BasePage';
import { FrameworkLogger } from '../logger/logger';
import { CustomerData } from '../testdata/customerFactory';
import { AssertionFailedError } from '../errors/errors';

export class CustomersPage extends BasePage {
  private get customersTab() {
    return this.page.getByRole('tab', { name: 'Customers' });
  }

  private get searchInput() {
    return this.page.getByRole('textbox', { name: 'Search customers…' });
  }

  constructor(page: Page, logger: FrameworkLogger, context?: BrowserContext) {
    super(page, logger, context);
  }

  async openCustomersTab(): Promise<void> {
    await this.waits.visible(this.customersTab, 'Customers tab');
    await this.actions.click(this.customersTab, 'Customers tab');
    await this.waits.visible(this.searchInput, 'Search customers');
  }

  async searchCustomer(query: string): Promise<void> {
    await this.waits.visible(this.searchInput, 'Search customers');
    await this.actions.click(this.searchInput, 'Search customers', { observe: false });
    await this.actions.fill(this.searchInput, 'Search customers', query);
    this.logger.info(`Searching customers for: ${query}`);
    await this.waits.observe('customer search');
  }

  customerCheckbox(customer: CustomerData) {
    const fullName = customer.fullName || `${customer.firstName} ${customer.lastName}`;
    return this.page.getByRole('checkbox', { name: `Select ${fullName}` });
  }

  async selectCreatedCustomer(customer: CustomerData): Promise<void> {
    const fullName = customer.fullName || `${customer.firstName} ${customer.lastName}`;
    const checkbox = this.customerCheckbox(customer);
    await this.waits.visible(checkbox, `Select ${fullName}`);
    await this.actions.click(checkbox, `Select ${fullName}`);
  }

  searchQuery(customer: CustomerData): string {
    const firstName = customer.firstName?.trim();
    if (!firstName) {
      throw new AssertionFailedError('Cannot search customers without a first name', {
        action: 'searchQuery',
      });
    }
    return firstName;
  }

  async viewCreatedCustomer(customer: CustomerData, searchName?: string): Promise<void> {
    const query = searchName || this.searchQuery(customer);
    await this.openCustomersTab();
    await this.searchCustomer(query);
    await this.selectCreatedCustomer(customer);
  }

  async viewCreatedCustomers(customers: CustomerData[]): Promise<void> {
    for (const customer of customers) {
      await this.viewCreatedCustomer(customer, this.searchQuery(customer));
    }
  }

  async assertCreatedCustomersVisible(customers: CustomerData[]): Promise<void> {
    await this.openCustomersTab();
    for (const customer of customers) {
      await this.searchCustomer(this.searchQuery(customer));
      await this.assertCreatedCustomerVisible(customer);
    }
    this.logger.info(`Verified ${customers.length} created customer(s) in the customers list`);
  }

  async assertCreatedCustomerVisible(customer: CustomerData): Promise<void> {
    const fullName = customer.fullName || `${customer.firstName} ${customer.lastName}`;
    await this.asserts.visible(this.customerCheckbox(customer), `Select ${fullName}`);
    this.logger.info(`Created customer is visible in the list: ${fullName} <${customer.email}>`);
  }

  async searchCustomersFor(query: string): Promise<void> {
    await this.openCustomersTab();
    await this.searchCustomer(query);
  }

  async assertCustomerNameNotVisible(name: string): Promise<void> {
    const checkbox = this.page.getByRole('checkbox', { name: `Select ${name}` });
    await this.asserts.hidden(checkbox, `Select ${name}`);
    const emptyState = this.page.getByText(/no customers|no results|no matching/i).first();
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    this.logger.info(
      `Verified "${name}" is not listed${emptyVisible ? ' (empty search state shown)' : ''}`,
    );
  }

  async assertUniqueCustomer(customer: CustomerData): Promise<void> {
    const fullName = customer.fullName || `${customer.firstName} ${customer.lastName}`;
    await this.openCustomersTab();
    await this.searchCustomer(this.searchQuery(customer));
    await this.asserts.countEquals(this.customerCheckbox(customer), `Select ${fullName}`, 1);
    this.logger.info(`Verified a single customer listing for ${fullName}`);
  }
}
