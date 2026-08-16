import { Locator, Page } from 'playwright';
import { AssertionFailedError, ErrorContext } from '../errors/errors';
import { FrameworkLogger } from '../logger/logger';

export class Assertions {
  constructor(
    private page: Page,
    private readonly logger?: FrameworkLogger,
  ) {}

  setPage(page: Page): void {
    this.page = page;
  }

  async visible(locator: Locator, name: string): Promise<void> {
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
      throw this.fail(`Expected ${name} to be visible`, 'assertVisible', name);
    }
    this.logger?.info(`Asserted visible: ${name}`);
  }

  async hidden(locator: Locator, name: string): Promise<void> {
    const visible = await locator.isVisible().catch(() => false);
    if (visible) {
      throw this.fail(`Expected ${name} to be hidden`, 'assertHidden', name);
    }
    this.logger?.info(`Asserted hidden: ${name}`);
  }

  async enabled(locator: Locator, name: string): Promise<void> {
    const enabled = await locator.isEnabled().catch(() => false);
    if (!enabled) {
      throw this.fail(`Expected ${name} to be enabled`, 'assertEnabled', name);
    }
    this.logger?.info(`Asserted enabled: ${name}`);
  }

  async textContains(locator: Locator, name: string, expected: string): Promise<void> {
    const text = ((await locator.innerText().catch(() => '')) || '').trim();
    if (!text.includes(expected)) {
      throw this.fail(`Expected ${name} to contain "${expected}", actual "${text}"`, 'assertText', name);
    }
    this.logger?.info(`Asserted ${name} contains "${expected}"`);
  }

  async textMatches(locator: Locator, name: string, expected: RegExp): Promise<void> {
    const text = ((await locator.innerText().catch(() => '')) || '').trim();
    if (!expected.test(text)) {
      throw this.fail(`Expected ${name} to match ${expected}, actual "${text}"`, 'assertText', name);
    }
    this.logger?.info(`Asserted ${name} matches ${expected}`);
  }

  async title(expected: string | RegExp): Promise<void> {
    const title = await this.page.title();
    const matches = typeof expected === 'string' ? title.includes(expected) : expected.test(title);
    if (!matches) {
      throw this.fail(`Expected page title ${expected}, actual "${title}"`, 'assertTitle');
    }
    this.logger?.info(`Asserted page title: ${title}`);
  }

  async titleNotEmpty(): Promise<void> {
    const title = await this.page.title();
    if (!title?.trim()) {
      throw this.fail('Expected page title not to be empty', 'assertTitleNotEmpty');
    }
    this.logger?.info(`Page title: ${title}`);
  }

  async urlContains(expected: string | RegExp): Promise<void> {
    const url = this.safeUrl();
    const matches = typeof expected === 'string' ? url.includes(expected) : expected.test(url);
    if (!matches) {
      throw this.fail(`Expected URL ${expected}, actual "${url}"`, 'assertUrl');
    }
    this.logger?.info(`Asserted URL contains ${expected}`);
  }

  async countEquals(locator: Locator, name: string, expected: number): Promise<void> {
    const actual = await locator.count();
    if (actual !== expected) {
      throw this.fail(`Expected ${expected} ${name} but found ${actual}`, 'assertCount', name);
    }
    this.logger?.info(`Asserted ${name} count is ${actual}`);
  }

  equals<T>(actual: T, expected: T, message: string, action = 'assertEquals'): void {
    if (actual !== expected) {
      throw this.fail(message, action);
    }
  }

  isTrue(condition: boolean, message: string, action = 'assertTrue'): void {
    if (!condition) {
      throw this.fail(message, action);
    }
  }

  notEmpty(value: unknown, message: string, action = 'assertNotEmpty'): void {
    if (value === undefined || value === null || value === '') {
      throw this.fail(message, action);
    }
  }

  private fail(message: string, action: string, locator?: string): AssertionFailedError {
    return new AssertionFailedError(message, this.ctx(action, locator));
  }

  private ctx(action: string, locator?: string): ErrorContext {
    return { action, locator, url: this.safeUrl() };
  }

  private safeUrl(): string {
    try {
      return this.page.url();
    } catch {
      return '';
    }
  }
}
