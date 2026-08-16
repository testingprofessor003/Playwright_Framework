import { Given, Then, When } from '@cucumber/cucumber';
import { CustomWorld } from '../../src/world/CustomWorld';

Given('I open the application', async function (this: CustomWorld) {
  await this.application.openApplication();
});

Given('I open {string}', async function (this: CustomWorld, url: string) {
  await this.application.openApplication(url);
});

Then('the page title should not be empty', async function (this: CustomWorld) {
  await this.application.assertTitleNotEmpty();
});

Then('the page title should contain {string}', async function (this: CustomWorld, expected: string) {
  await this.application.assertTitleContains(expected);
});

Then('the page should be loaded', async function (this: CustomWorld) {
  await this.application.assertPageLoaded();
});

Given(
  'I store the page title in the shared buffer as {string}',
  async function (this: CustomWorld, key: string) {
    await this.application.storePageTitle(key);
  },
);

When('I read the global shared buffer key {string}', async function (this: CustomWorld, key: string) {
  await this.application.readGlobalSharedKey(key);
});

Then('the last shared value should exist', async function (this: CustomWorld) {
  await this.application.assertLastSharedValueExists();
});

Then('the shared buffer key {string} should not be empty', async function (this: CustomWorld, key: string) {
  await this.application.assertSharedKeyNotEmpty(key);
});
