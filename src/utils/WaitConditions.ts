import { Locator, Page } from 'playwright';
import { env } from '../config/env';
import { mapPlaywrightError } from '../errors/mapPlaywrightError';
import { TimeoutExceededError } from '../errors/errors';
import { FrameworkLogger } from '../logger/logger';

export type LoadState = 'load' | 'domcontentloaded' | 'networkidle';

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class WaitConditions {
  constructor(
    private page: Page,
    private readonly logger?: FrameworkLogger,
  ) {}

  setPage(page: Page): void {
    this.page = page;
  }

  async sleep(ms: number, reason?: string): Promise<void> {
    if (ms <= 0) return;
    if (reason) {
      this.logger?.info(`Waiting ${ms}ms (${reason})`);
    }
    await sleep(ms);
  }

  /** Mild pause so a headed run can be watched after a button click or UI change. */
  async observe(actionName = 'action', ms = env.clickPauseMs): Promise<void> {
    if (ms <= 0) return;
    this.logger?.info(`Observe pause ${ms}ms after ${actionName}`);
    await this.sleep(ms);
  }

  async visible(locator: Locator, name: string, timeout = env.defaultTimeout): Promise<void> {
    try {
      this.logger?.info(`Wait visible: ${name}`);
      await locator.waitFor({ state: 'visible', timeout });
    } catch (error) {
      throw mapPlaywrightError(error, { action: 'waitVisible', locator: name, url: this.safeUrl() });
    }
  }

  async hidden(locator: Locator, name: string, timeout = env.defaultTimeout): Promise<void> {
    try {
      this.logger?.info(`Wait hidden: ${name}`);
      await locator.waitFor({ state: 'hidden', timeout });
    } catch (error) {
      throw mapPlaywrightError(error, { action: 'waitHidden', locator: name, url: this.safeUrl() });
    }
  }

  async attached(locator: Locator, name: string, timeout = env.defaultTimeout): Promise<void> {
    try {
      this.logger?.info(`Wait attached: ${name}`);
      await locator.waitFor({ state: 'attached', timeout });
    } catch (error) {
      throw mapPlaywrightError(error, { action: 'waitAttached', locator: name, url: this.safeUrl() });
    }
  }

  async enabled(locator: Locator, name: string, timeout = env.defaultTimeout): Promise<void> {
    await this.until(() => locator.isEnabled(), {
      timeout,
      message: `Timed out waiting for ${name} to be enabled`,
      action: 'waitEnabled',
      locator: name,
    });
  }

  async url(url: string | RegExp, timeout = env.navigationTimeout): Promise<void> {
    try {
      this.logger?.info(`Wait URL: ${url}`);
      await this.page.waitForURL(url, { timeout });
    } catch (error) {
      throw mapPlaywrightError(error, { action: 'waitUrl', url: String(url) });
    }
  }

  async loadState(state: LoadState = 'domcontentloaded', timeout = env.navigationTimeout): Promise<void> {
    try {
      await this.page.waitForLoadState(state, { timeout });
    } catch (error) {
      throw mapPlaywrightError(error, { action: 'waitLoadState', url: this.safeUrl() });
    }
  }

  async networkIdle(timeout = 15000): Promise<void> {
    await this.loadState('networkidle', timeout);
  }

  async stable(locator: Locator, name = 'element', timeout = 5000): Promise<void> {
    await this.visible(locator, name, timeout);
  }

  async text(locator: Locator, name: string, expected: string | RegExp, timeout = env.defaultTimeout): Promise<void> {
    await this.until(
      async () => {
        const actual = ((await locator.innerText().catch(() => '')) || '').trim();
        return typeof expected === 'string' ? actual.includes(expected) : expected.test(actual);
      },
      {
        timeout,
        message: `Timed out waiting for ${name} to contain ${expected}`,
        action: 'waitText',
        locator: name,
      },
    );
  }

  async until(
    predicate: () => boolean | Promise<boolean>,
    options: { timeout?: number; interval?: number; message: string; action?: string; locator?: string },
  ): Promise<void> {
    const timeout = options.timeout ?? env.defaultTimeout;
    const interval = options.interval ?? 250;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      if (await predicate()) {
        return;
      }
      await this.sleep(interval);
    }

    throw new TimeoutExceededError(options.message, {
      action: options.action || 'waitUntil',
      locator: options.locator,
      url: this.safeUrl(),
    });
  }

  private safeUrl(): string {
    try {
      return this.page.url();
    } catch {
      return '';
    }
  }
}
