import { Then, When } from '@cucumber/cucumber';
import { CustomWorld } from '../../src/world/CustomWorld';

When('I open the bank manager portal', { timeout: 60000 }, async function (this: CustomWorld) {
  await this.customer.openBankManagerPortal();
});

When('I add a new customer with random data', { timeout: 120000 }, async function (this: CustomWorld) {
  await this.customer.addCustomersWithRandomData(1);
});

When('I add {int} customer with random data', { timeout: 300000 }, async function (this: CustomWorld, count: number) {
  await this.customer.addCustomersWithRandomData(count);
});

When('I add {int} customers with random data', { timeout: 300000 }, async function (this: CustomWorld, count: number) {
  await this.customer.addCustomersWithRandomData(count);
});

When('I view the created customer in the customers list', { timeout: 60000 }, async function (this: CustomWorld) {
  await this.customer.viewCreatedCustomer();
});

When('I view the created customers in the customers list', { timeout: 180000 }, async function (this: CustomWorld) {
  await this.customer.viewCreatedCustomers();
});

Then('the customer should be created successfully', { timeout: 60000 }, async function (this: CustomWorld) {
  await this.customer.assertCustomerCreated();
});

Then('the created customer should be visible in the customers list', { timeout: 60000 }, async function (this: CustomWorld) {
  await this.customer.assertCreatedCustomerVisible();
});

Then('{int} customer should be visible in the customers list', { timeout: 180000 }, async function (this: CustomWorld, count: number) {
  await this.customer.assertCustomerCountVisible(count);
});

Then('{int} customers should be visible in the customers list', { timeout: 180000 }, async function (this: CustomWorld, count: number) {
  await this.customer.assertCustomerCountVisible(count);
});

When('I open {int} account for the created customer', { timeout: 180000 }, async function (this: CustomWorld, count: number) {
  await this.customer.openAccountsForCreatedCustomers(count);
});

When('I open {int} accounts for the created customer', { timeout: 180000 }, async function (this: CustomWorld, count: number) {
  await this.customer.openAccountsForCreatedCustomers(count);
});

When('I open {int} account for each created customer', { timeout: 360000 }, async function (this: CustomWorld, count: number) {
  await this.customer.openAccountsForCreatedCustomers(count);
});

When('I open {int} accounts for each created customer', { timeout: 360000 }, async function (this: CustomWorld, count: number) {
  await this.customer.openAccountsForCreatedCustomers(count);
});

Then('{int} account should be created for the customer', { timeout: 60000 }, async function (this: CustomWorld, count: number) {
  await this.customer.assertAccountsCreatedForCustomer(count);
});

Then('{int} accounts should be created for the customer', { timeout: 60000 }, async function (this: CustomWorld, count: number) {
  await this.customer.assertAccountsCreatedForCustomer(count);
});

Then('{int} account should be created for each customer', { timeout: 60000 }, async function (this: CustomWorld, count: number) {
  await this.customer.assertAccountsCreatedForEachCustomer(count);
});

Then('{int} accounts should be created for each customer', { timeout: 60000 }, async function (this: CustomWorld, count: number) {
  await this.customer.assertAccountsCreatedForEachCustomer(count);
});

When('I open the add customer form', { timeout: 60000 }, async function (this: CustomWorld) {
  await this.customer.openAddCustomerForm();
});

When('I submit the add customer form without filling details', { timeout: 60000 }, async function (this: CustomWorld) {
  await this.customer.submitEmptyCustomerForm();
});

When(
  'I try to add a customer with invalid {word} {string}',
  { timeout: 120000 },
  async function (this: CustomWorld, field: string, value: string) {
    await this.customer.addCustomerWithInvalidField(field, value);
  },
);

Then('the add customer form should remain invalid', { timeout: 60000 }, async function (this: CustomWorld) {
  await this.customer.assertAddCustomerFormInvalid();
});

When('I search customers for {string}', { timeout: 60000 }, async function (this: CustomWorld, query: string) {
  await this.customer.searchCustomers(query);
});

Then('no customer named {string} should be visible', { timeout: 60000 }, async function (this: CustomWorld, name: string) {
  await this.customer.assertCustomerNameNotVisible(name);
});

When('I add the same customer again', { timeout: 120000 }, async function (this: CustomWorld) {
  await this.customer.addSameCustomerAgain();
});

Then('a duplicate customer should not be created', { timeout: 120000 }, async function (this: CustomWorld) {
  await this.customer.assertDuplicateCustomerNotCreated();
});

When(
  'I open an account for the created customer in {string} with deposit {string}',
  { timeout: 180000 },
  async function (this: CustomWorld, currency: string, amount: string) {
    await this.customer.openAccountForCreatedCustomer(currency, amount);
  },
);

When('I login to the created customer account', { timeout: 120000 }, async function (this: CustomWorld) {
  await this.customer.loginToCreatedCustomerAccount();
});

Then('I should be logged in as the created customer', { timeout: 60000 }, async function (this: CustomWorld) {
  await this.customer.assertLoggedInAsCreatedCustomer();
});

When('I deposit a random amount into the created customer account', { timeout: 120000 }, async function (this: CustomWorld) {
  await this.customer.depositRandomAmount();
});

Then('the deposit should be completed', { timeout: 60000 }, async function (this: CustomWorld) {
  await this.customer.assertDepositCompleted();
});
