import { Given, Then, When } from '@cucumber/cucumber';
import { CustomWorld } from '../../src/world/CustomWorld';

Given('I launch the core banking application', async function (this: CustomWorld) {
  await this.login.launchCoreBanking();
});

Given('I launch the application at {string}', async function (this: CustomWorld, url: string) {
  await this.login.launchAt(url);
});

Given('I launch {string} in a new window', async function (this: CustomWorld, url: string) {
  await this.login.launchInNewWindow(url);
});

Given('I reuse the saved bank manager session', { timeout: 180000 }, async function (this: CustomWorld) {
  await this.login.reuseSavedBankManagerSession();
});

When('I switch to the window with URL {string}', async function (this: CustomWorld, url: string) {
  await this.login.switchToWindowByUrl(url);
});

When('I switch to window index {int}', async function (this: CustomWorld, index: number) {
  await this.login.switchToWindowIndex(index);
});

When('I switch back to the parent window', async function (this: CustomWorld) {
  await this.login.switchToParentWindow();
});

When('I sign in with valid credentials', { timeout: 120000 }, async function (this: CustomWorld) {
  await this.login.signInWithValidCredentials();
});

When(
  'I sign in with email {string} and password {string}',
  { timeout: 120000 },
  async function (this: CustomWorld, email: string, password: string) {
    await this.login.signIn(email, password);
  },
);

Then('I should be logged into the application', { timeout: 60000 }, async function (this: CustomWorld) {
  await this.login.assertLoggedIn();
});
