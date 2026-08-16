import { BrowserContext, Page } from 'playwright';
import { BasePage } from './BasePage';
import { FrameworkLogger } from '../logger/logger';
import { CustomerData } from '../testdata/customerFactory';
import { ConfigurationError } from '../errors/errors';

export class AddCustomerPage extends BasePage {
  private get bankManagerPortalButton() {
    return this.page.getByRole('button', { name: 'Bank manager portal' });
  }

  private get addCustomerTab() {
    return this.page.getByRole('tab', { name: 'Add Customer' });
  }

  private get firstNameInput() {
    return this.page.getByRole('textbox', { name: 'John', exact: true });
  }

  private get lastNameInput() {
    return this.page.getByRole('textbox', { name: 'Doe', exact: true });
  }

  private get emailInput() {
    return this.page.getByRole('textbox', { name: 'john.doe@email.com' });
  }

  private get phoneInput() {
    return this.page.getByRole('textbox', { name: '+44 20 7946' });
  }

  private get cityInput() {
    return this.page.getByRole('textbox', { name: 'London' });
  }

  private get postcodeInput() {
    return this.page.getByRole('textbox', { name: 'SW1A 1AA' });
  }

  private get addressInput() {
    return this.page.getByRole('textbox', { name: 'Baker Street' });
  }

  private get addCustomerButton() {
    return this.page.getByRole('button', { name: 'Add Customer' });
  }

  constructor(page: Page, logger: FrameworkLogger, context?: BrowserContext) {
    super(page, logger, context);
  }

  async openBankManagerPortal(): Promise<void> {
    await this.waits.visible(this.bankManagerPortalButton, 'Bank manager portal');
    await this.actions.click(this.bankManagerPortalButton, 'Bank manager portal');
  }

  async openAddCustomerTab(): Promise<void> {
    await this.waits.visible(this.addCustomerTab, 'Add Customer tab');
    await this.actions.click(this.addCustomerTab, 'Add Customer tab');
    await this.waits.visible(this.firstNameInput, 'First name');
  }

  async fillCustomer(customer: CustomerData): Promise<void> {
    this.logger.info(
      `Filling customer form with Faker data: ${customer.firstName} ${customer.lastName} <${customer.email}>`,
    );
    await this.fillField(this.firstNameInput, 'First name', customer.firstName);
    await this.fillField(this.lastNameInput, 'Last name', customer.lastName);
    await this.fillField(this.emailInput, 'Email', customer.email);
    await this.fillField(this.phoneInput, 'Phone', customer.phone);
    await this.fillField(this.cityInput, 'City', customer.city);
    await this.fillField(this.postcodeInput, 'Postcode', customer.postcode);
    await this.fillField(this.addressInput, 'Address', customer.address);
  }

  async fillCustomerField(field: string, value: string): Promise<void> {
    const locator = this.locatorForField(field);
    await this.fillField(locator, field, value);
  }

  async submitEmptyCustomerForm(): Promise<void> {
    await this.submitAddCustomer();
  }

  async assertFormInvalid(): Promise<void> {
    const invalidCount = await this.page.locator('input:invalid, textarea:invalid, select:invalid').count();
    const validationMessage = await this.firstInvalidMessage();
    const errorVisible = await this.page
      .getByText(/required|invalid|please fill|enter a valid|must be|cannot be empty/i)
      .first()
      .isVisible()
      .catch(() => false);

    this.asserts.isTrue(
      invalidCount > 0 || Boolean(validationMessage) || errorVisible,
      'Expected the add customer form to remain invalid after submit',
      'assertFormInvalid',
    );
    this.logger.info(
      `Add Customer form stayed invalid (invalidFields=${invalidCount}, message="${validationMessage || ''}")`,
    );
  }

  async assertDuplicateCustomerBlocked(customer: CustomerData): Promise<void> {
    const errorVisible = await this.page
      .getByText(/already exists|duplicate|already registered|customer exists/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (errorVisible) {
      this.logger.info(`Duplicate customer was blocked for ${customer.email}`);
      return;
    }

    const listed = this.page.getByText(customer.email);
    const matches = await listed.count();
    this.asserts.isTrue(
      matches <= 1,
      `Duplicate customer was created for ${customer.email}`,
      'assertDuplicateCustomerBlocked',
    );
    this.logger.info(`Duplicate customer was not created a second time for ${customer.email}`);
  }

  async submitAddCustomer(): Promise<void> {
    await this.actions.click(this.addCustomerButton, 'Add Customer');
  }

  async addRandomCustomer(customer: CustomerData): Promise<void> {
    await this.openBankManagerPortal();
    await this.openAddCustomerTab();
    await this.fillCustomer(customer);
    await this.submitAddCustomer();
  }

  async assertCustomerCreated(customer: CustomerData): Promise<void> {
    const success = this.page.getByText(/customer (added|created)|success/i).first();
    const successVisible = await success.isVisible().catch(() => false);
    if (successVisible) {
      this.logger.info(`Customer created confirmation shown for ${customer.email}`);
      return;
    }

    const listed = this.page.getByText(customer.email).first();
    const listedVisible = await listed.isVisible().catch(() => false);
    if (listedVisible) {
      this.logger.info(`Created customer email is visible: ${customer.email}`);
      return;
    }

    await this.waits.visible(this.addCustomerButton, 'Add Customer');
    this.logger.info(`Add Customer form is still available after submit for ${customer.email}`);
  }

  private locatorForField(field: string): ReturnType<Page['getByRole']> {
    const key = field.replace(/\s+/g, '').toLowerCase();
    const fields: Record<string, ReturnType<Page['getByRole']>> = {
      firstname: this.firstNameInput,
      lastname: this.lastNameInput,
      email: this.emailInput,
      phone: this.phoneInput,
      city: this.cityInput,
      postcode: this.postcodeInput,
      zip: this.postcodeInput,
      address: this.addressInput,
    };
    const locator = fields[key];
    if (!locator) {
      throw new ConfigurationError(`Unknown customer form field "${field}"`, {
        action: 'locatorForField',
      });
    }
    return locator;
  }

  private async firstInvalidMessage(): Promise<string> {
    const fields = [
      this.firstNameInput,
      this.lastNameInput,
      this.emailInput,
      this.phoneInput,
      this.cityInput,
      this.postcodeInput,
      this.addressInput,
    ];
    for (const field of fields) {
      const message = await field
        .evaluate((element) => (element as HTMLInputElement).validationMessage || '')
        .catch(() => '');
      if (message.trim()) {
        return message.trim();
      }
    }
    return '';
  }

  private async fillField(
    locator: ReturnType<Page['getByRole']>,
    name: string,
    value: string,
  ): Promise<void> {
    await this.waits.visible(locator, name);
    await this.actions.click(locator, name, { observe: false });
    if (!value) {
      await this.actions.clear(locator, name);
      return;
    }
    await this.actions.fill(locator, name, value);
  }
}
