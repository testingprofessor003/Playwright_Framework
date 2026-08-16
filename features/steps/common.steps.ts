import { Given, Then, When } from '@cucumber/cucumber';
import { CustomWorld } from '../../src/world/CustomWorld';

Given('the application base url is configured', async function (this: CustomWorld) {
  this.application.logBaseUrl();
});

When('I wait for {int} milliseconds', async function (this: CustomWorld, ms: number) {
  await this.application.waitMilliseconds(ms);
});

Then('I take a screenshot named {string}', async function (this: CustomWorld, name: string) {
  const buffer = await this.application.takeScreenshot(name);
  await this.attach(buffer, 'image/png');
});
