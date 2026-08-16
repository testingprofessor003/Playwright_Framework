import { BrowserContext, Page } from 'playwright';
import { BasePage } from './BasePage';
import { FrameworkLogger } from '../logger/logger';
import { env } from '../config/env';

/**
 * Core banking sign-in. Handles same-tab redirects and popup/auth windows.
 */
export class LoginPage extends BasePage {
  private get signInButton() {
    return this.page.getByRole('button', { name: 'Sign in', exact: true });
  }

  private get emailInput() {
    return this.page.getByRole('textbox', { name: 'Email address' });
  }

  private get passwordInput() {
    return this.page.getByRole('textbox', { name: 'Password' });
  }

  private get signInSecurelyButton() {
    return this.page.getByRole('button', { name: 'Sign in securely' });
  }

  constructor(page: Page, logger: FrameworkLogger, context?: BrowserContext) {
    super(page, logger, context);
  }

  async open(url: string = env.baseUrl): Promise<void> {
    this.logger.info(`Launching application: ${url}`);
    await this.launchApplication(url);
  }

  async clickSignIn(): Promise<void> {
    await this.waits.visible(this.signInButton, 'Sign in');
    const nextPage = await this.actions.clickAndSwitchToNewWindowIfOpened(this.signInButton, 'Sign in', 2500);
    this.setPage(nextPage);
  }

  async enterEmail(email: string): Promise<void> {
    await this.waits.visible(this.emailInput, 'Email address');
    await this.actions.click(this.emailInput, 'Email address', { observe: false });
    await this.actions.fill(this.emailInput, 'Email address', email);
    await this.actions.pressOn(this.emailInput, 'Email address', 'Tab');
  }

  async enterPassword(password: string): Promise<void> {
    await this.waits.visible(this.passwordInput, 'Password');
    await this.actions.click(this.passwordInput, 'Password', { observe: false });
    await this.actions.fill(this.passwordInput, 'Password', password);
    await this.actions.pressOn(this.passwordInput, 'Password', 'Enter');
  }

  async submitSecureSignIn(): Promise<void> {
    const visible = await this.actions.isVisible(this.signInSecurelyButton, 'Sign in securely');
    if (visible) {
      await this.actions.click(this.signInSecurelyButton, 'Sign in securely');
    }
  }

  async signIn(email: string, password: string): Promise<Page> {
    await this.clickSignIn();
    await this.enterEmail(email);
    await this.enterPassword(password);
    await this.submitSecureSignIn();
    await this.waitForReturnToApplication();
    return this.page;
  }

  async waitForReturnToApplication(): Promise<void> {
    const appHost = new URL(env.baseUrl).host;
    const timeout = Math.max(env.navigationTimeout, 45000);
    await this.waits.sleep(1000, 'post-login settle');

    await this.waits.until(
      async () => {
        const pages = this.context?.pages().filter((p) => !p.isClosed()) || [this.page];
        for (const candidate of pages) {
          const url = candidate.url();
          const onIdentityProvider = /microsoftonline|login\.microsoft|accounts\.google|auth0|okta/i.test(url);
          if (onIdentityProvider || !url.includes(appHost)) {
            continue;
          }
          const emailVisible = await candidate
            .getByRole('textbox', { name: 'Email address' })
            .isVisible()
            .catch(() => false);
          const passwordVisible = await candidate
            .getByRole('textbox', { name: 'Password' })
            .isVisible()
            .catch(() => false);
          const signInVisible = await candidate
            .getByRole('button', { name: 'Sign in', exact: true })
            .isVisible()
            .catch(() => false);
          if (!emailVisible && !passwordVisible && !signInVisible) {
            this.setPage(candidate);
            await candidate.bringToFront();
            this.logger.info(`Signed in; application window is ${url}`);
            return true;
          }
        }
        return false;
      },
      {
        timeout,
        interval: 400,
        message: 'Timed out waiting to return to the application after login',
        action: 'waitForReturnToApplication',
      },
    ).catch(async () => {
      this.logger.warn('Could not confirm the post-login application window; continuing on the current page');
      await this.waits.loadState('domcontentloaded');
    });
  }

  async isOnLoginScreen(): Promise<boolean> {
    const emailVisible = await this.actions.isVisible(this.emailInput, 'Email address');
    const signInVisible = await this.actions.isVisible(this.signInButton, 'Sign in');
    return emailVisible || signInVisible;
  }

  async assertSignedIn(): Promise<void> {
    await this.asserts.titleNotEmpty();
    const stillOnEmail = await this.actions.isVisible(this.emailInput, 'Email address');
    if (stillOnEmail) {
      await this.waits.hidden(this.emailInput, 'Email address', env.navigationTimeout);
    }
  }
}
