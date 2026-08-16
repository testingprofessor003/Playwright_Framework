import { BrowserContext, Locator, Page, FrameLocator, Download, Dialog } from 'playwright';
import { FrameworkLogger } from '../logger/logger';
import { mapPlaywrightError } from '../errors/mapPlaywrightError';
import { ConfigurationError, ElementNotFoundError } from '../errors/errors';
import { Assertions } from './Assertions';
import { WaitConditions, sleep } from './WaitConditions';
import { getActivityReporter, withSuppressedWinston } from '../reports/extent/ActivityReporter';

export type SelectValue =
  | string
  | string[]
  | { value?: string; label?: string; index?: number }
  | null
  | undefined;

export interface SelectedOption {
  value: string;
  label: string;
}

export class PlaywrightActions {
  private parentPage?: Page;
  readonly waits: WaitConditions;
  readonly asserts: Assertions;

  constructor(
    private page: Page,
    private readonly logger: FrameworkLogger,
    private readonly context?: BrowserContext,
  ) {
    this.waits = new WaitConditions(page, logger);
    this.asserts = new Assertions(page, logger);
  }

  getPage(): Page {
    return this.page;
  }

  setPage(page: Page): void {
    this.page = page;
    this.waits.setPage(page);
    this.asserts.setPage(page);
  }

  private ctx(action: string, locator?: string) {
    return { action, locator, url: this.safeUrl() };
  }

  private safeUrl(): string {
    try {
      return this.page.url();
    } catch {
      return '';
    }
  }

  private async run<T>(action: string, locator: string | undefined, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    this.logger.debug(`Action ${action}${locator ? ` [${locator}]` : ''} on ${this.safeUrl()}`);
    return withSuppressedWinston(async () => {
      try {
        const result = await fn();
        getActivityReporter()?.logAction({
          action,
          locator,
          url: this.safeUrl(),
          status: 'pass',
          durationMs: Date.now() - started,
        });
        return result;
      } catch (error) {
        const mapped = mapPlaywrightError(error, this.ctx(action, locator));
        this.logger.error(`Action failed: ${mapped.code} ${mapped.message}`, mapped.toJSON());
        getActivityReporter()?.logAction({
          action,
          locator,
          url: this.safeUrl(),
          status: 'fail',
          durationMs: Date.now() - started,
          error: mapped.message,
        });
        throw mapped;
      }
    });
  }

  async goto(url: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'domcontentloaded'): Promise<void> {
    await this.run('goto', url, async () => {
      this.logger.info(`Navigate to ${url}`);
      await this.page.goto(url, { waitUntil });
    });
  }

  async click(locator: Locator, name: string, options?: { observe?: boolean }): Promise<void> {
    await this.run('click', name, async () => {
      this.logger.info(`Click: ${name}`);
      await locator.click();
    });
    await this.observeAfterClick(name, options?.observe);
  }

  async dblClick(locator: Locator, name: string, options?: { observe?: boolean }): Promise<void> {
    await this.run('dblclick', name, async () => {
      this.logger.info(`Double click: ${name}`);
      await locator.dblclick();
    });
    await this.observeAfterClick(name, options?.observe);
  }

  async fill(locator: Locator, name: string, value: string): Promise<void> {
    await this.run('fill', name, async () => {
      this.logger.info(`Fill: ${name}${name.toLowerCase().includes('password') ? ' [encrypted secret decrypted in memory]' : ''}`);
      await locator.fill(value);
    });
  }

  async type(locator: Locator, name: string, value: string, delay = 50): Promise<void> {
    await this.run('type', name, async () => {
      this.logger.info(`Type: ${name}`);
      await locator.pressSequentially(value, { delay });
    });
  }

  async clear(locator: Locator, name: string): Promise<void> {
    await this.run('clear', name, async () => {
      this.logger.info(`Clear: ${name}`);
      await locator.clear();
    });
  }

  async select(locator: Locator, name: string, value?: SelectValue): Promise<SelectedOption> {
    return this.run('select', name, async () => {
      if (this.isBlankSelectValue(value)) {
        const picked = await this.pickRandomOption(locator, name);
        this.logger.info(`Select: ${name} was blank — picked random option "${picked.label}" (${picked.value})`);
        await locator.selectOption({ value: picked.value });
        return picked;
      }

      this.logger.info(`Select: ${name} = ${JSON.stringify(value)}`);
      await locator.selectOption(value as Exclude<SelectValue, null | undefined>);
      return this.readSelectedOption(locator, value);
    });
  }

  async selectRandom(
    locator: Locator,
    name: string,
    options?: { exclude?: Array<string | RegExp> },
  ): Promise<SelectedOption> {
    return this.run('selectRandom', name, async () => {
      const picked = await this.pickRandomOption(locator, name, options?.exclude);
      this.logger.info(`Select: ${name} picked random option "${picked.label}" (${picked.value})`);
      await locator.selectOption({ value: picked.value });
      return picked;
    });
  }

  private isBlankSelectValue(value: SelectValue): boolean {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0 || value.every((item) => String(item).trim() === '');
    const hasValue = value.value != null && String(value.value).trim() !== '';
    const hasLabel = value.label != null && String(value.label).trim() !== '';
    const hasIndex = typeof value.index === 'number' && Number.isFinite(value.index);
    return !hasValue && !hasLabel && !hasIndex;
  }

  private isPlaceholderOption(value: string, label: string, disabled: boolean): boolean {
    if (disabled) return true;
    const normalized = label.replace(/\s+/g, ' ').trim();
    if (!normalized && !value.trim()) return true;
    if (!value.trim()) return true;
    return /^(select|choose|pick)\b/i.test(normalized) || /[…]$/.test(normalized);
  }

  private isExcludedLabel(label: string, exclude?: Array<string | RegExp>): boolean {
    const normalized = label.replace(/\s+/g, ' ').trim();
    if (!normalized || !exclude?.length) return false;
    return exclude.some((rule) =>
      rule instanceof RegExp
        ? rule.test(normalized)
        : normalized.toLowerCase() === rule.trim().toLowerCase() ||
          normalized.toLowerCase().includes(rule.trim().toLowerCase()),
    );
  }

  private async pickRandomOption(
    locator: Locator,
    name: string,
    exclude?: Array<string | RegExp>,
  ): Promise<SelectedOption> {
    const options = locator.locator('option');
    const count = await options.count();
    const usable: SelectedOption[] = [];

    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      const value = (await option.getAttribute('value')) ?? '';
      const label = ((await option.textContent()) ?? '').trim();
      const disabled = await option.isDisabled().catch(() => false);
      if (this.isPlaceholderOption(value, label, disabled)) continue;
      if (this.isExcludedLabel(label, exclude)) continue;
      usable.push({ value, label: label || value });
    }

    if (!usable.length) {
      throw new ElementNotFoundError(`No selectable options found in dropdown "${name}"`, {
        action: 'selectRandom',
        locator: name,
      });
    }

    return usable[Math.floor(Math.random() * usable.length)];
  }

  private async readSelectedOption(locator: Locator, requested: SelectValue): Promise<SelectedOption> {
    const value = await locator.inputValue().catch(() => '');
    const label = ((await locator.locator('option:checked').textContent().catch(() => '')) ?? '').trim();
    if (value || label) {
      return { value, label: label || value };
    }
    if (requested && typeof requested === 'object' && !Array.isArray(requested)) {
      return {
        value: requested.value || String(requested.index ?? ''),
        label: requested.label || requested.value || '',
      };
    }
    return { value: String(requested ?? ''), label: String(requested ?? '') };
  }

  async hover(locator: Locator, name: string): Promise<void> {
    await this.run('hover', name, async () => {
      this.logger.info(`Hover: ${name}`);
      await locator.hover();
    });
  }

  async check(locator: Locator, name: string, options?: { observe?: boolean }): Promise<void> {
    await this.run('check', name, async () => {
      this.logger.info(`Check: ${name}`);
      await locator.check();
    });
    await this.observeAfterClick(name, options?.observe);
  }

  async uncheck(locator: Locator, name: string, options?: { observe?: boolean }): Promise<void> {
    await this.run('uncheck', name, async () => {
      this.logger.info(`Uncheck: ${name}`);
      await locator.uncheck();
    });
    await this.observeAfterClick(name, options?.observe);
  }

  async upload(locator: Locator, name: string, filePath: string | string[]): Promise<void> {
    await this.run('upload', name, async () => {
      this.logger.info(`Upload: ${name}`);
      await locator.setInputFiles(filePath);
    });
  }

  async download(trigger: () => Promise<void>): Promise<Download> {
    return this.run('download', undefined, async () => {
      this.logger.info('Wait for download');
      const [download] = await Promise.all([this.page.waitForEvent('download'), trigger()]);
      return download;
    });
  }

  frame(selector: string): FrameLocator {
    this.logger.debug(`Resolve iframe ${selector}`);
    return this.page.frameLocator(selector);
  }

  async press(key: string): Promise<void> {
    await this.run('press', key, async () => {
      this.logger.info(`Keyboard: ${key}`);
      await this.page.keyboard.press(key);
    });
  }

  async pressOn(locator: Locator, name: string, key: string): Promise<void> {
    await this.run('pressOn', `${name} [${key}]`, async () => {
      this.logger.info(`Press ${key} on ${name}`);
      await locator.press(key);
    });
  }

  async handleDialog(action: 'accept' | 'dismiss', promptText?: string): Promise<void> {
    this.page.once('dialog', async (dialog: Dialog) => {
      this.logger.info(`Dialog ${dialog.type()}: ${dialog.message()}`);
      if (action === 'accept') {
        await dialog.accept(promptText);
      } else {
        await dialog.dismiss();
      }
    });
  }

  async waitForVisible(locator: Locator, name: string, timeout?: number): Promise<void> {
    await this.run('waitForVisible', name, async () => {
      await this.waits.visible(locator, name, timeout);
    });
  }

  async waitForHidden(locator: Locator, name: string, timeout?: number): Promise<void> {
    await this.run('waitForHidden', name, async () => {
      await this.waits.hidden(locator, name, timeout);
    });
  }

  async waitForUrl(url: string | RegExp, timeout?: number): Promise<void> {
    await this.run('waitForUrl', String(url), async () => {
      await this.waits.url(url, timeout);
    });
  }

  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'networkidle'): Promise<void> {
    await this.run('waitForLoadState', state, async () => {
      await this.waits.loadState(state);
    });
  }

  async getText(locator: Locator, name: string): Promise<string> {
    return this.run('getText', name, async () => {
      const text = (await locator.innerText()).trim();
      this.logger.debug(`Text of ${name}: ${text}`);
      return text;
    });
  }

  async getAttribute(locator: Locator, name: string, attribute: string): Promise<string | null> {
    return this.run('getAttribute', name, async () => {
      return locator.getAttribute(attribute);
    });
  }

  async getCount(locator: Locator, name: string): Promise<number> {
    return this.run('getCount', name, async () => {
      return locator.count();
    });
  }

  async isVisible(locator: Locator, name: string): Promise<boolean> {
    return this.run('isVisible', name, async () => locator.isVisible());
  }

  async isEnabled(locator: Locator, name: string): Promise<boolean> {
    return this.run('isEnabled', name, async () => locator.isEnabled());
  }

  async screenshot(name: string, fullPage = false): Promise<Buffer> {
    return this.run('screenshot', name, async () => {
      this.logger.info(`Screenshot: ${name}`);
      return this.page.screenshot({ fullPage });
    });
  }

  async getTitle(): Promise<string> {
    return this.run('getTitle', undefined, async () => this.page.title());
  }

  async assertVisible(locator: Locator, name: string): Promise<void> {
    await this.asserts.visible(locator, name);
  }

  async assertText(locator: Locator, name: string, expected: string | RegExp): Promise<void> {
    if (typeof expected === 'string') {
      await this.asserts.textContains(locator, name, expected);
      return;
    }
    await this.asserts.textMatches(locator, name, expected);
  }

  async assertTitle(expected: string | RegExp): Promise<void> {
    await this.asserts.title(expected);
  }

  async assertTitleNotEmpty(): Promise<void> {
    await this.asserts.titleNotEmpty();
  }

  async scrollIntoView(locator: Locator, name: string): Promise<void> {
    await this.run('scrollIntoView', name, async () => {
      await locator.scrollIntoViewIfNeeded();
    });
  }

  requireContext(): BrowserContext {
    if (!this.context) {
      throw new ConfigurationError('Browser context is required for window and launch helpers', {
        action: 'requireContext',
      });
    }
    return this.context;
  }

  async launchApplication(
    url: string,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'domcontentloaded',
  ): Promise<void> {
    this.logger.info(`Launch application: ${url}`);
    await this.goto(url, waitUntil);
  }

  async launchApplicationInNewWindow(
    url: string,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'domcontentloaded',
  ): Promise<Page> {
    return this.run('launchApplicationInNewWindow', url, async () => {
      const context = this.requireContext();
      this.parentPage = this.page;
      this.logger.info(`Launch application in new window: ${url}`);
      const newPage = await context.newPage();
      await newPage.goto(url, { waitUntil });
      this.page = newPage;
      await newPage.bringToFront();
      return newPage;
    });
  }

  async clickAndSwitchToNewWindow(locator: Locator, name: string, timeout = 15000): Promise<Page> {
    const popup = await this.run('clickAndSwitchToNewWindow', name, async () => {
      const context = this.requireContext();
      this.parentPage = this.page;
      this.logger.info(`Click ${name} and switch to new window`);
      const [opened] = await Promise.all([context.waitForEvent('page', { timeout }), locator.click()]);
      await opened.waitForLoadState('domcontentloaded');
      this.setPage(opened);
      await opened.bringToFront();
      this.logger.info(`Switched to new window ${opened.url()}`);
      return opened;
    });
    await this.observeAfterClick(name);
    return popup;
  }

  async clickAndSwitchToNewWindowIfOpened(locator: Locator, name: string, timeout = 8000): Promise<Page> {
    const nextPage = await this.run('clickAndSwitchToNewWindowIfOpened', name, async () => {
      const context = this.context;
      this.parentPage = this.page;
      this.logger.info(`Click ${name} (switch if a new window opens)`);
      if (!context) {
        await locator.click();
        return this.page;
      }
      const popupPromise = context.waitForEvent('page', { timeout }).catch(() => undefined);
      await locator.click();
      const popup = await popupPromise;
      if (!popup) {
        this.logger.info('No new window opened; staying on the current page');
        return this.page;
      }
      await popup.waitForLoadState('domcontentloaded');
      this.setPage(popup);
      await popup.bringToFront();
      this.logger.info(`Switched to new window ${popup.url()}`);
      return popup;
    });
    await this.observeAfterClick(name);
    return nextPage;
  }

  async switchToWindowByIndex(index: number): Promise<Page> {
    return this.run('switchToWindowByIndex', String(index), async () => {
      const pages = this.requireContext().pages().filter((p) => !p.isClosed());
      if (index < 0 || index >= pages.length) {
        throw new ElementNotFoundError(`No window at index ${index}. Open windows: ${pages.length}`, {
          action: 'switchToWindowByIndex',
        });
      }
      this.parentPage = this.page;
      this.page = pages[index];
      await this.page.bringToFront();
      this.logger.info(`Switched to window index ${index}: ${this.page.url()}`);
      return this.page;
    });
  }

  async switchToWindowByUrl(url: string | RegExp): Promise<Page> {
    return this.run('switchToWindowByUrl', String(url), async () => {
      const pages = this.requireContext().pages().filter((p) => !p.isClosed());
      const match = pages.find((p) => (typeof url === 'string' ? p.url().includes(url) : url.test(p.url())));
      if (!match) {
        throw new ElementNotFoundError(`No window found with URL ${url}`, { action: 'switchToWindowByUrl' });
      }
      this.parentPage = this.page;
      this.page = match;
      await this.page.bringToFront();
      this.logger.info(`Switched to window by URL: ${match.url()}`);
      return match;
    });
  }

  async switchToWindowByTitle(title: string | RegExp): Promise<Page> {
    return this.run('switchToWindowByTitle', String(title), async () => {
      const pages = this.requireContext().pages().filter((p) => !p.isClosed());
      for (const candidate of pages) {
        const currentTitle = await candidate.title();
        const matches = typeof title === 'string' ? currentTitle.includes(title) : title.test(currentTitle);
        if (matches) {
          this.parentPage = this.page;
          this.page = candidate;
          await candidate.bringToFront();
          this.logger.info(`Switched to window by title: ${currentTitle}`);
          return candidate;
        }
      }
      throw new ElementNotFoundError(`No window found with title ${title}`, { action: 'switchToWindowByTitle' });
    });
  }

  async switchToParentWindow(): Promise<Page> {
    return this.run('switchToParentWindow', undefined, async () => {
      const pages = this.context?.pages().filter((p) => !p.isClosed()) || [];
      const parent =
        this.parentPage && !this.parentPage.isClosed() ? this.parentPage : pages[0] || this.page;
      this.page = parent;
      await this.page.bringToFront();
      this.logger.info(`Switched to parent window: ${this.page.url()}`);
      return this.page;
    });
  }

  async closeCurrentWindow(): Promise<Page> {
    return this.run('closeCurrentWindow', undefined, async () => {
      const closing = this.page;
      await closing.close();
      const remaining = this.requireContext().pages().filter((p) => !p.isClosed());
      this.page = remaining[remaining.length - 1] || this.parentPage;
      if (!this.page || this.page.isClosed()) {
        throw new ElementNotFoundError('No window remains after close', { action: 'closeCurrentWindow' });
      }
      await this.page.bringToFront();
      this.logger.info(`Closed window; active window is ${this.page.url()}`);
      return this.page;
    });
  }

  async waitForPopupCloseAndSwitchToParent(timeout = 20000): Promise<Page> {
    return this.run('waitForPopupCloseAndSwitchToParent', undefined, async () => {
      if (!this.page.isClosed()) {
        await this.page.waitForEvent('close', { timeout }).catch(() => undefined);
      }
      return this.switchToParentWindow();
    });
  }

  async getWindowCount(): Promise<number> {
    return this.requireContext().pages().filter((p) => !p.isClosed()).length;
  }

  async waitForWindowWithUrl(urlPart: string | RegExp, timeout = 30000): Promise<Page> {
    return this.run('waitForWindowWithUrl', String(urlPart), async () => {
      const context = this.requireContext();
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const pages = context.pages().filter((p) => !p.isClosed());
        const match = pages.find((p) =>
          typeof urlPart === 'string' ? p.url().includes(urlPart) : urlPart.test(p.url()),
        );
        if (match) {
          this.page = match;
          await match.bringToFront();
          this.logger.info(`Found window with URL ${match.url()}`);
          return match;
        }
        await sleep(250);
      }
      throw new ElementNotFoundError(`Timed out waiting for a window matching ${urlPart}`, {
        action: 'waitForWindowWithUrl',
      });
    });
  }

  private async observeAfterClick(name: string, observe = true): Promise<void> {
    if (observe === false) {
      return;
    }
    await this.waits.observe(name);
  }
}
