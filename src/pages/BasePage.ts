import { BrowserContext, Locator, Page } from 'playwright';
import { PlaywrightActions } from '../utils/PlaywrightActions';
import { Assertions } from '../utils/Assertions';
import { WaitConditions } from '../utils/WaitConditions';
import { env } from '../config/env';
import { FrameworkLogger } from '../logger/logger';

export class BasePage {
  readonly actions: PlaywrightActions;

  constructor(
    protected page: Page,
    protected readonly logger: FrameworkLogger,
    protected readonly context?: BrowserContext,
  ) {
    this.actions = new PlaywrightActions(page, logger, context);
  }

  get waits(): WaitConditions {
    return this.actions.waits;
  }

  get asserts(): Assertions {
    return this.actions.asserts;
  }

  getPage(): Page {
    return this.page;
  }

  setPage(page: Page): void {
    this.page = page;
    this.actions.setPage(page);
  }

  /** XPath locator. Pass `//button[@type='submit']` or `xpath=//button[@type='submit']`. */
  protected xpath(expression: string): Locator {
    const expr = expression.replace(/^xpath=/i, '');
    return this.page.locator(`xpath=${expr}`);
  }

  /**
   * Prefer an accessible locator; fall back to XPath when that node is missing.
   * Use this on every generated control so the page still works if the role/name changes.
   */
  protected byPreferredOrXPath(preferred: Locator, xpath: string): Locator {
    return preferred.or(this.xpath(xpath)).first();
  }

  async goto(url: string = env.baseUrl): Promise<void> {
    await this.actions.goto(url);
  }

  async launchApplication(url: string = env.baseUrl): Promise<void> {
    await this.actions.launchApplication(url);
  }

  async launchApplicationInNewWindow(url: string = env.baseUrl): Promise<Page> {
    const page = await this.actions.launchApplicationInNewWindow(url);
    this.setPage(page);
    return page;
  }

  async getTitle(): Promise<string> {
    return this.actions.getTitle();
  }

  async takeScreenshot(name: string): Promise<Buffer> {
    return this.actions.screenshot(name, true);
  }
}
