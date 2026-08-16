import { BrowserContext, Page } from 'playwright';
import { BasePage } from '../BasePage';
import { FrameworkLogger } from '../../logger/logger';
import { env } from '../../config/env';

/**
 * Template page object. Copy this file, rename the class, and replace locators
 * when adding a real application page.
 */
export class ExamplePage extends BasePage {
  private readonly heading = this.page.locator('h1').first();
  private readonly body = this.page.locator('body');

  constructor(page: Page, logger: FrameworkLogger, context?: BrowserContext) {
    super(page, logger, context);
  }

  async open(url: string = env.baseUrl): Promise<void> {
    this.logger.info(`Opening example page: ${url}`);
    await this.goto(url);
    await this.waits.visible(this.body, 'page body');
  }

  async getHeadingText(): Promise<string> {
    const visible = await this.actions.isVisible(this.heading, 'main heading');
    if (!visible) {
      return '';
    }
    return this.actions.getText(this.heading, 'main heading');
  }

  async assertLoaded(): Promise<void> {
    await this.asserts.visible(this.body, 'page body');
    await this.asserts.titleNotEmpty();
  }
}
