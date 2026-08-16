import { BaseBusiness } from './BaseBusiness';
import { AddCustomerPage } from '../pages/AddCustomerPage';
import { CustomersPage } from '../pages/CustomersPage';
import { OpenAccountPage } from '../pages/OpenAccountPage';
import { CustomerDashboardPage } from '../pages/CustomerDashboardPage';
import { randomCustomer, CustomerData, customerWithInvalidField } from '../testdata/customerFactory';
import { AccountData, accountsForCount, randomDepositAmount } from '../testdata/accountFactory';
import { ConfigurationError } from '../errors/errors';

const SHARED_TTL = { ttlMs: 30 * 60 * 1000 };

interface CustomerAccounts {
  customerName: string;
  accounts: AccountData[];
}

export class CustomerBusiness extends BaseBusiness {
  async openBankManagerPortal(): Promise<void> {
    const customerPage = this.pageObject(AddCustomerPage);
    await customerPage.openBankManagerPortal();
    this.activate(customerPage);
  }

  async addCustomersWithRandomData(count: number): Promise<void> {
    if (count < 1) {
      throw new ConfigurationError(`Customer count must be at least 1, received ${count}`, {
        action: 'addCustomersWithRandomData',
      });
    }

    const customerPage = this.pageObject(AddCustomerPage);
    const customers: CustomerData[] = [];

    for (let index = 0; index < count; index += 1) {
      const customer = randomCustomer();
      customers.push(customer);
      this.logger.info(`Creating customer ${index + 1}/${count}: ${customer.fullName}`);
      await customerPage.openAddCustomerTab();
      await customerPage.fillCustomer(customer);
      await customerPage.submitAddCustomer();
    }

    await this.persistCustomers(customers);
    this.activate(customerPage);
  }

  async viewCreatedCustomer(): Promise<void> {
    const customer = await this.createdCustomer();
    const customersPage = this.pageObject(CustomersPage);
    await customersPage.viewCreatedCustomer(customer, customer.firstName);
    this.activate(customersPage);
  }

  async viewCreatedCustomers(): Promise<void> {
    const customers = await this.storedCustomers();
    const customersPage = this.pageObject(CustomersPage);
    await customersPage.viewCreatedCustomers(customers);
    this.activate(customersPage);
  }

  async assertCustomerCreated(): Promise<void> {
    const customer = await this.createdCustomer();
    const customerPage = this.pageObject(AddCustomerPage);
    await customerPage.assertCustomerCreated(customer);
  }

  async assertCreatedCustomerVisible(): Promise<void> {
    const customer = await this.createdCustomer();
    const customersPage = this.pageObject(CustomersPage);
    await customersPage.assertCreatedCustomerVisible(customer);
  }

  async assertCustomerCountVisible(count: number): Promise<void> {
    const customers = await this.storedCustomers();
    this.asserts.equals(
      customers.length,
      count,
      `Expected ${count} customer(s) in shared memory but found ${customers.length}`,
      'assertCustomerCount',
    );
    const customersPage = this.pageObject(CustomersPage);
    await customersPage.assertCreatedCustomersVisible(customers);
  }

  async openAccountsForCreatedCustomers(accountCount: number): Promise<void> {
    const customers = await this.storedCustomers();
    const accounts = accountsForCount(accountCount);
    const accountsByCustomer: CustomerAccounts[] = customers.map((customer) => ({
      customerName: customer.fullName,
      accounts,
    }));

    await this.shared.set('accountCount', accountCount, { scope: 'scenario' });
    await this.shared.set('accounts', accounts, { scope: 'scenario' });
    await this.shared.set('accountsByCustomer', accountsByCustomer, { scope: 'scenario' });
    await this.shared.set('totalAccountCount', customers.length * accountCount, { scope: 'scenario' });
    await this.shared.set('accountCount', accountCount, { scope: 'global', ...SHARED_TTL });
    await this.shared.set('accountsByCustomer', accountsByCustomer, { scope: 'global', ...SHARED_TTL });
    await this.shared.set('totalAccountCount', customers.length * accountCount, { scope: 'global', ...SHARED_TTL });
    this.logger.info(`Opening ${accountCount} account(s) for each of ${customers.length} customer(s)`);

    const openAccountPage = this.pageObject(OpenAccountPage);
    await openAccountPage.openAccountsForCustomers(customers, accounts);
    this.activate(openAccountPage);
  }

  async assertAccountsCreatedForCustomer(count: number): Promise<void> {
    const customers = await this.storedCustomers();
    const openAccountPage = this.pageObject(OpenAccountPage);
    const customerName = customers[customers.length - 1].fullName;
    await openAccountPage.assertAccountsOpened(count, customerName);
    await openAccountPage.assertAccountCount(count, count, customerName);
  }

  async assertAccountsCreatedForEachCustomer(count: number): Promise<void> {
    const customers = await this.storedCustomers();
    const storedCount =
      (await this.shared.get<number>('accountCount', 'scenario')) ??
      (await this.shared.get<number>('accountCount', 'global'));
    const openAccountPage = this.pageObject(OpenAccountPage);
    await openAccountPage.assertAccountsOpened(count, customers[customers.length - 1].fullName);
    await openAccountPage.assertAccountCount(count, storedCount ?? count, `${customers.length} customers`);
  }

  async openAddCustomerForm(): Promise<void> {
    const customerPage = this.pageObject(AddCustomerPage);
    await customerPage.openAddCustomerTab();
    this.activate(customerPage);
  }

  async submitEmptyCustomerForm(): Promise<void> {
    const customerPage = this.pageObject(AddCustomerPage);
    await customerPage.submitEmptyCustomerForm();
    this.activate(customerPage);
  }

  async addCustomerWithInvalidField(field: string, value: string): Promise<void> {
    const customerPage = this.pageObject(AddCustomerPage);
    await customerPage.openAddCustomerTab();
    const customer = customerWithInvalidField(field as keyof CustomerData, value);
    this.logger.info(`Submitting customer with invalid ${field}: "${value}"`);
    await customerPage.fillCustomer(customer);
    await customerPage.submitAddCustomer();
    this.activate(customerPage);
  }

  async assertAddCustomerFormInvalid(): Promise<void> {
    const customerPage = this.pageObject(AddCustomerPage);
    await customerPage.assertFormInvalid();
  }

  async searchCustomers(query: string): Promise<void> {
    const customersPage = this.pageObject(CustomersPage);
    await customersPage.searchCustomersFor(query);
    this.activate(customersPage);
  }

  async assertCustomerNameNotVisible(name: string): Promise<void> {
    const customersPage = this.pageObject(CustomersPage);
    await customersPage.assertCustomerNameNotVisible(name);
  }

  async addSameCustomerAgain(): Promise<void> {
    const customer = await this.createdCustomer();
    const customerPage = this.pageObject(AddCustomerPage);
    await customerPage.openAddCustomerTab();
    await customerPage.fillCustomer(customer);
    await customerPage.submitAddCustomer();
    this.activate(customerPage);
  }

  async assertDuplicateCustomerNotCreated(): Promise<void> {
    const customer = await this.createdCustomer();
    const customerPage = this.pageObject(AddCustomerPage);
    await customerPage.assertDuplicateCustomerBlocked(customer);

    const customersPage = this.pageObject(CustomersPage);
    await customersPage.assertUniqueCustomer(customer);
    this.activate(customersPage);
  }

  async openAccountForCreatedCustomer(currency: string, amount: string): Promise<void> {
    const customer = await this.createdCustomer();
    const openAccountPage = this.pageObject(OpenAccountPage);
    await openAccountPage.openAccount(customer.fullName, currency, amount);
    await this.shared.set('accountCount', 1, { scope: 'scenario' });
    await this.shared.set('accountCount', 1, { scope: 'global', ...SHARED_TTL });
    this.activate(openAccountPage);
  }

  async loginToCreatedCustomerAccount(): Promise<void> {
    const customer = await this.createdCustomer();
    const fullName =
      (await this.shared.get<string>('customerName', 'scenario')) ||
      (await this.shared.get<string>('customerName', 'global')) ||
      customer.fullName;
    const firstName =
      (await this.shared.get<string>('customerFirstName', 'scenario')) ||
      (await this.shared.get<string>('customerFirstName', 'global')) ||
      customer.firstName;
    this.logger.info(`Logging into customer account using shared name "${fullName}" and first name "${firstName}"`);

    const dashboardPage = this.pageObject(CustomerDashboardPage);
    await dashboardPage.loginAsCreatedCustomer({ ...customer, fullName, firstName });
    this.activate(dashboardPage);
  }

  async assertLoggedInAsCreatedCustomer(): Promise<void> {
    const customer = await this.createdCustomer();
    const firstName =
      (await this.shared.get<string>('customerFirstName', 'scenario')) ||
      (await this.shared.get<string>('customerFirstName', 'global')) ||
      customer.firstName;
    const dashboardPage = this.pageObject(CustomerDashboardPage);
    await dashboardPage.assertLoggedInAs({ ...customer, firstName });
  }

  async depositRandomAmount(): Promise<void> {
    const amount = randomDepositAmount();
    const accounts =
      (await this.shared.get<AccountData[]>('accounts', 'scenario')) ||
      (await this.shared.get<AccountData[]>('accounts', 'global'));
    const currency = accounts?.[0]?.currency || '';
    this.logger.info(`Depositing randomised amount ${amount} into the created customer account`);

    const dashboardPage = this.pageObject(CustomerDashboardPage);
    const deposit = await dashboardPage.depositRandomAmount(amount, currency);
    await this.shared.set('lastDeposit', deposit, { scope: 'scenario' });
    await this.shared.set('lastDeposit', deposit, { scope: 'global', ...SHARED_TTL });
    await this.shared.set('depositAmount', deposit.amount, { scope: 'scenario' });
    this.activate(dashboardPage);
  }

  async assertDepositCompleted(): Promise<void> {
    const amount =
      (await this.shared.get<string>('depositAmount', 'scenario')) ||
      (await this.shared.get<{ amount?: string }>('lastDeposit', 'scenario'))?.amount ||
      '';
    const dashboardPage = this.pageObject(CustomerDashboardPage);
    await dashboardPage.assertDepositCompleted(amount);
  }

  private async storedCustomers(): Promise<CustomerData[]> {
    const customers =
      (await this.shared.get<CustomerData[]>('customers', 'scenario')) ||
      (await this.shared.get<CustomerData[]>('customers', 'global'));
    if (customers?.length) {
      return customers;
    }

    const single =
      (await this.shared.get<CustomerData>('customer', 'scenario')) ||
      (await this.shared.get<CustomerData>('lastCustomer', 'global'));
    if (single) {
      return [single];
    }

    throw new ConfigurationError('No generated customers were stored in the shared buffer', {
      action: 'storedCustomers',
    });
  }

  private async createdCustomer(): Promise<CustomerData> {
    const customers = await this.storedCustomers();
    return customers[customers.length - 1];
  }

  private async persistCustomers(customers: CustomerData[]): Promise<void> {
    const latest = customers[customers.length - 1];
    await this.shared.set('customers', customers, { scope: 'scenario' });
    await this.shared.set('customerCount', customers.length, { scope: 'scenario' });
    await this.shared.set('customerNames', customers.map((customer) => customer.fullName), { scope: 'scenario' });
    await this.shared.set('customer', latest, { scope: 'scenario' });
    await this.shared.set('customerName', latest.fullName, { scope: 'scenario' });
    await this.shared.set('customerFirstName', latest.firstName, { scope: 'scenario' });
    await this.shared.set('customerLastName', latest.lastName, { scope: 'scenario' });
    await this.shared.set('customers', customers, { scope: 'global', ...SHARED_TTL });
    await this.shared.set('customerCount', customers.length, { scope: 'global', ...SHARED_TTL });
    await this.shared.set('lastCustomer', latest, { scope: 'global', ...SHARED_TTL });
    await this.shared.set('customerName', latest.fullName, { scope: 'global', ...SHARED_TTL });
    await this.shared.set('customerFirstName', latest.firstName, { scope: 'global', ...SHARED_TTL });
    await this.shared.set('customerLastName', latest.lastName, { scope: 'global', ...SHARED_TTL });
    this.logger.info(
      `Stored ${customers.length} customer(s) in shared memory: ${customers.map((customer) => customer.fullName).join(', ')}`,
    );
  }
}
