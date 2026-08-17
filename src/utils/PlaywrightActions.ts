import fs from 'fs';
import path from 'path';
import {
  BrowserContext,
  Dialog,
  Download,
  Frame,
  FrameLocator,
  Locator,
  Page,
} from 'playwright';
import { FrameworkLogger } from '../logger/logger';
import { mapPlaywrightError } from '../errors/mapPlaywrightError';
import { ConfigurationError, ElementNotFoundError, FrameworkError } from '../errors/errors';
import { Assertions } from './Assertions';
import { WaitConditions, sleep } from './WaitConditions';
import { resolveHealedLocator } from './SelfHeal';
import { env } from '../config/env';
import { DOWNLOADS_DIR } from '../config/paths';
import { ensureDir, sanitizeFileName } from './files';
import { getActivityReporter, withSuppressedWinston } from '../reports/extent/ActivityReporter';
import { shouldKeepArtifact } from '../config/artifacts';
import { actionScreenshotPath, publishScreenshot } from '../reports/publishArtifacts';

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

/** In-memory file for `setInputFiles` (no disk path required). */
export interface UploadFilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export interface SavedDownload {
  download: Download;
  suggestedFilename: string;
  savedPath: string;
}

export class PlaywrightActions {
  private parentPage?: Page;
  readonly waits: WaitConditions;
  readonly asserts: Assertions;
  private actionShotSeq = 0;

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

  private async captureActionScreenshot(
    action: string,
    locator: string | undefined,
    failed: boolean,
  ): Promise<string | undefined> {
    if (!shouldKeepArtifact(env.actionScreenshot, failed)) return undefined;
    if (!this.page || this.page.isClosed()) return undefined;
    try {
      this.actionShotSeq += 1;
      const fileBase = [
        sanitizeFileName(action),
        sanitizeFileName(locator || 'page'),
        String(Date.now()),
        String(this.actionShotSeq).padStart(3, '0'),
      ].join('_');
      const absPath = actionScreenshotPath(fileBase);
      const buffer = await this.page.screenshot({ fullPage: env.screenshotFullPage });
      return await publishScreenshot({
        buffer,
        absPath,
        title: `Action ${action}${locator ? `: ${locator}` : ''}`,
        extentActivity: false,
        // Avoid flooding Allure with one attachment per click/fill; Extent embeds on the activity.
        allure: failed,
      });
    } catch (error) {
      this.logger.debug(
        `Action screenshot skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private async run<T>(action: string, locator: string | undefined, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    this.logger.debug(`Action ${action}${locator ? ` [${locator}]` : ''} on ${this.safeUrl()}`);
    return withSuppressedWinston(async () => {
      try {
        const result = await fn();
        const screenshot = await this.captureActionScreenshot(action, locator, false);
        getActivityReporter()?.logAction({
          action,
          locator,
          url: this.safeUrl(),
          status: 'pass',
          durationMs: Date.now() - started,
          screenshot,
        });
        return result;
      } catch (error) {
        const mapped = mapPlaywrightError(error, this.ctx(action, locator));
        this.logger.error(`Action failed: ${mapped.code} ${mapped.message}`, mapped.toJSON());
        const screenshot = await this.captureActionScreenshot(action, locator, true);
        getActivityReporter()?.logAction({
          action,
          locator,
          url: this.safeUrl(),
          status: 'fail',
          durationMs: Date.now() - started,
          error: mapped.message,
          screenshot,
        });
        throw mapped;
      }
    });
  }

  private isHealableFailure(error: unknown): boolean {
    if (!(error instanceof FrameworkError)) return false;
    return error.category === 'ELEMENT' || error.category === 'TIMEOUT';
  }

  /** Run a locator action; when SELF_HEAL_ENABLED, retry with a healed locator on element/timeout failures. */
  private async runWithHeal<T>(
    action: string,
    name: string,
    locator: Locator,
    fn: (active: Locator) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.run(action, name, () => fn(locator));
    } catch (error) {
      if (!env.selfHealEnabled || !this.isHealableFailure(error)) {
        throw error;
      }

      const healed = await resolveHealedLocator(this.page, name, action, error, this.logger);
      if (!healed) {
        throw error;
      }

      this.logger.info(
        `Self-heal retrying ${action} on "${name}" via ${healed.strategy}${healed.fromCache ? ' (cache)' : ''}: ${healed.description}`,
      );
      return this.run(`${action}:healed`, `${name} [${healed.strategy}]`, () => fn(healed.locator));
    }
  }

  async goto(url: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'domcontentloaded'): Promise<void> {
    await this.run('goto', url, async () => {
      this.logger.info(`Navigate to ${url}`);
      await this.page.goto(url, { waitUntil });
    });
  }

  async click(locator: Locator, name: string, options?: { observe?: boolean }): Promise<void> {
    await this.runWithHeal('click', name, locator, async (active) => {
      this.logger.info(`Click: ${name}`);
      await active.click();
    });
    await this.observeAfterClick(name, options?.observe);
  }

  async dblClick(
    locator: Locator,
    name: string,
    options?: { observe?: boolean; position?: { x: number; y: number }; force?: boolean; delay?: number },
  ): Promise<void> {
    await this.runWithHeal('dblclick', name, locator, async (active) => {
      this.logger.info(`Double click: ${name}`);
      await active.dblclick({
        position: options?.position,
        force: options?.force,
        delay: options?.delay,
      });
    });
    await this.observeAfterClick(name, options?.observe);
  }

  /**
   * Drag source onto target (HTML5 drag-and-drop or mouse drag depending on the page).
   * Prefer this for sortable lists, kanban cards, and file drop zones that accept element drops.
   */
  async dragAndDrop(
    source: Locator,
    sourceName: string,
    target: Locator,
    targetName: string,
    options?: { force?: boolean; timeout?: number },
  ): Promise<void> {
    await this.run('dragAndDrop', `${sourceName} → ${targetName}`, async () => {
      this.logger.info(`Drag and drop: ${sourceName} → ${targetName}`);
      await source.dragTo(target, { force: options?.force, timeout: options?.timeout });
    });
  }

  /** Drag an element by pixel offsets from its center (useful when there is no drop-target locator). */
  async dragByOffset(
    locator: Locator,
    name: string,
    offsetX: number,
    offsetY: number,
    options?: { steps?: number },
  ): Promise<void> {
    await this.runWithHeal('dragByOffset', name, locator, async (active) => {
      const box = await active.boundingBox();
      if (!box) {
        throw new ElementNotFoundError(`Cannot drag "${name}" — element has no bounding box`, {
          action: 'dragByOffset',
          locator: name,
        });
      }
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      const steps = options?.steps ?? 12;
      this.logger.info(`Drag ${name} by offset (${offsetX}, ${offsetY})`);
      await this.page.mouse.move(startX, startY);
      await this.page.mouse.down();
      await this.page.mouse.move(startX + offsetX, startY + offsetY, { steps });
      await this.page.mouse.up();
    });
  }

  /** Mouse-based drag from source center to target center (fallback when `dragTo` is unreliable). */
  async dragAndDropByMouse(
    source: Locator,
    sourceName: string,
    target: Locator,
    targetName: string,
    options?: { steps?: number },
  ): Promise<void> {
    await this.run('dragAndDropByMouse', `${sourceName} → ${targetName}`, async () => {
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      if (!sourceBox || !targetBox) {
        throw new ElementNotFoundError(
          `Cannot mouse-drag "${sourceName}" → "${targetName}" — missing bounding box`,
          { action: 'dragAndDropByMouse', locator: `${sourceName} → ${targetName}` },
        );
      }
      const steps = options?.steps ?? 16;
      const fromX = sourceBox.x + sourceBox.width / 2;
      const fromY = sourceBox.y + sourceBox.height / 2;
      const toX = targetBox.x + targetBox.width / 2;
      const toY = targetBox.y + targetBox.height / 2;
      this.logger.info(`Mouse drag and drop: ${sourceName} → ${targetName}`);
      await this.page.mouse.move(fromX, fromY);
      await this.page.mouse.down();
      await this.page.mouse.move(toX, toY, { steps });
      await this.page.mouse.up();
    });
  }

  async fill(locator: Locator, name: string, value: string): Promise<void> {
    await this.runWithHeal('fill', name, locator, async (active) => {
      this.logger.info(`Fill: ${name}${name.toLowerCase().includes('password') ? ' [encrypted secret decrypted in memory]' : ''}`);
      await active.fill(value);
    });
  }

  async type(locator: Locator, name: string, value: string, delay = 50): Promise<void> {
    await this.runWithHeal('type', name, locator, async (active) => {
      this.logger.info(`Type: ${name}`);
      await active.pressSequentially(value, { delay });
    });
  }

  async clear(locator: Locator, name: string): Promise<void> {
    await this.runWithHeal('clear', name, locator, async (active) => {
      this.logger.info(`Clear: ${name}`);
      await active.clear();
    });
  }

  async select(locator: Locator, name: string, value?: SelectValue): Promise<SelectedOption> {
    return this.runWithHeal('select', name, locator, async (active) => {
      if (this.isBlankSelectValue(value)) {
        const picked = await this.pickRandomOption(active, name);
        this.logger.info(`Select: ${name} was blank — picked random option "${picked.label}" (${picked.value})`);
        await active.selectOption({ value: picked.value });
        await active.dispatchEvent('input');
        await active.dispatchEvent('change');
        return picked;
      }

      this.logger.info(`Select: ${name} = ${JSON.stringify(value)}`);
      await active.selectOption(value as Exclude<SelectValue, null | undefined>);
      await active.dispatchEvent('input');
      await active.dispatchEvent('change');
      return this.readSelectedOption(active, value);
    });
  }

  async selectRandom(
    locator: Locator,
    name: string,
    options?: { exclude?: Array<string | RegExp> },
  ): Promise<SelectedOption> {
    return this.runWithHeal('selectRandom', name, locator, async (active) => {
      const picked = await this.pickRandomOption(active, name, options?.exclude);
      this.logger.info(`Select: ${name} picked random option "${picked.label}" (${picked.value})`);
      await active.selectOption({ value: picked.value });
      await active.dispatchEvent('input');
      await active.dispatchEvent('change');
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
      const { value, label, disabled } = await option.evaluate((el) => {
        const node = el as HTMLOptionElement;
        return {
          value: node.value ?? '',
          label: (node.textContent ?? '').trim(),
          disabled: Boolean(node.disabled),
        };
      });
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
    await this.runWithHeal('hover', name, locator, async (active) => {
      this.logger.info(`Hover: ${name}`);
      await active.hover();
    });
  }

  async check(locator: Locator, name: string, options?: { observe?: boolean }): Promise<void> {
    await this.runWithHeal('check', name, locator, async (active) => {
      this.logger.info(`Check: ${name}`);
      await active.check();
    });
    await this.observeAfterClick(name, options?.observe);
  }

  async uncheck(locator: Locator, name: string, options?: { observe?: boolean }): Promise<void> {
    await this.runWithHeal('uncheck', name, locator, async (active) => {
      this.logger.info(`Uncheck: ${name}`);
      await active.uncheck();
    });
    await this.observeAfterClick(name, options?.observe);
  }

  // --- Uploads ------------------------------------------------------------------

  /** Set file(s) on an `<input type="file">` (or equivalent). Paths must exist on disk. */
  async upload(locator: Locator, name: string, filePath: string | string[]): Promise<void> {
    await this.runWithHeal('upload', name, locator, async (active) => {
      const paths = Array.isArray(filePath) ? filePath : [filePath];
      for (const file of paths) {
        if (!fs.existsSync(file)) {
          throw new ConfigurationError(`Upload file not found: ${file}`, {
            action: 'upload',
            locator: name,
          });
        }
      }
      this.logger.info(`Upload: ${name} ← ${paths.join(', ')}`);
      await active.setInputFiles(paths);
    });
  }

  /** Upload in-memory file payload(s) without writing to disk first. */
  async uploadPayload(
    locator: Locator,
    name: string,
    files: UploadFilePayload | UploadFilePayload[],
  ): Promise<void> {
    await this.runWithHeal('uploadPayload', name, locator, async (active) => {
      const list = Array.isArray(files) ? files : [files];
      this.logger.info(`Upload payload: ${name} (${list.map((f) => f.name).join(', ')})`);
      await active.setInputFiles(list);
    });
  }

  /** Clear a file input (`setInputFiles([])`). */
  async clearUpload(locator: Locator, name: string): Promise<void> {
    await this.runWithHeal('clearUpload', name, locator, async (active) => {
      this.logger.info(`Clear upload: ${name}`);
      await active.setInputFiles([]);
    });
  }

  // --- Downloads ----------------------------------------------------------------

  /** Wait for a download started by `trigger` (e.g. clicking a link). */
  async download(trigger: () => Promise<void>, timeout?: number): Promise<Download> {
    return this.run('download', undefined, async () => {
      this.logger.info('Wait for download');
      const [download] = await Promise.all([
        this.page.waitForEvent('download', timeout != null ? { timeout } : undefined),
        trigger(),
      ]);
      return download;
    });
  }

  /** Click a control and wait for the resulting download. */
  async downloadByClick(
    locator: Locator,
    name: string,
    options?: { timeout?: number; observe?: boolean },
  ): Promise<Download> {
    const download = await this.download(async () => {
      await locator.click();
    }, options?.timeout);
    await this.observeAfterClick(name, options?.observe);
    this.logger.info(`Download started via click: ${name} → ${download.suggestedFilename()}`);
    return download;
  }

  /**
   * Run `trigger`, wait for download, and save under `reports/downloads/` (or `saveDir`).
   * Returns the Playwright Download plus the absolute saved path.
   */
  async downloadAndSave(
    trigger: () => Promise<void>,
    options?: { saveDir?: string; fileName?: string; timeout?: number },
  ): Promise<SavedDownload> {
    return this.run('downloadAndSave', undefined, async () => {
      this.logger.info('Wait for download and save to disk');
      const [download] = await Promise.all([
        this.page.waitForEvent('download', options?.timeout != null ? { timeout: options.timeout } : undefined),
        trigger(),
      ]);
      const suggestedFilename = download.suggestedFilename();
      const saveDir = options?.saveDir || DOWNLOADS_DIR;
      ensureDir(saveDir);
      const fileName = options?.fileName || sanitizeFileName(suggestedFilename) || `download-${Date.now()}`;
      const savedPath = path.join(saveDir, fileName);
      await download.saveAs(savedPath);
      this.logger.info(`Download saved: ${savedPath}`);
      return { download, suggestedFilename, savedPath };
    });
  }

  /** Click to download and save the file under `reports/downloads/` (or `saveDir`). */
  async downloadByClickAndSave(
    locator: Locator,
    name: string,
    options?: { saveDir?: string; fileName?: string; timeout?: number; observe?: boolean },
  ): Promise<SavedDownload> {
    const saved = await this.downloadAndSave(async () => {
      await locator.click();
    }, options);
    await this.observeAfterClick(name, options?.observe);
    this.logger.info(`Download via ${name} saved to ${saved.savedPath}`);
    return saved;
  }

  // --- Frames / iframes ---------------------------------------------------------

  /** FrameLocator for an iframe CSS/selector (preferred for actions inside iframes). */
  frame(selector: string): FrameLocator {
    this.logger.debug(`Resolve iframe ${selector}`);
    return this.page.frameLocator(selector);
  }

  /** Nested iframe: outer selector → inner selector. */
  nestedFrame(outerSelector: string, innerSelector: string): FrameLocator {
    this.logger.debug(`Resolve nested iframe ${outerSelector} >> ${innerSelector}`);
    return this.page.frameLocator(outerSelector).frameLocator(innerSelector);
  }

  /** Locator inside an iframe (same as `frame(selector).locator(inner)`). */
  inFrame(frameSelector: string, inner: string): Locator {
    return this.frame(frameSelector).locator(inner);
  }

  /** Resolve a Playwright Frame by URL substring/RegExp (null if missing). */
  getFrameByUrl(url: string | RegExp): Frame | null {
    const frames = this.page.frames();
    const match = frames.find((f) => (typeof url === 'string' ? f.url().includes(url) : url.test(f.url())));
    this.logger.debug(`Frame by URL ${url}: ${match ? match.url() : 'not found'}`);
    return match ?? null;
  }

  /** Resolve a Playwright Frame by name attribute (null if missing). */
  getFrameByName(name: string): Frame | null {
    const match = this.page.frame({ name });
    this.logger.debug(`Frame by name ${name}: ${match ? match.url() : 'not found'}`);
    return match ?? null;
  }

  /** Require a Frame by URL or throw. */
  requireFrameByUrl(url: string | RegExp): Frame {
    const frame = this.getFrameByUrl(url);
    if (!frame) {
      throw new ElementNotFoundError(`No iframe found matching URL ${url}`, {
        action: 'requireFrameByUrl',
      });
    }
    return frame;
  }

  /** Require a Frame by name or throw. */
  requireFrameByName(name: string): Frame {
    const frame = this.getFrameByName(name);
    if (!frame) {
      throw new ElementNotFoundError(`No iframe found with name "${name}"`, {
        action: 'requireFrameByName',
      });
    }
    return frame;
  }

  /** Click inside an iframe using FrameLocator (does not change page context). */
  async clickInFrame(
    frameSelector: string,
    inner: string,
    name: string,
    options?: { observe?: boolean },
  ): Promise<void> {
    const locator = this.inFrame(frameSelector, inner);
    await this.click(locator, name, options);
  }

  /** Fill inside an iframe using FrameLocator. */
  async fillInFrame(frameSelector: string, inner: string, name: string, value: string): Promise<void> {
    const locator = this.inFrame(frameSelector, inner);
    await this.fill(locator, name, value);
  }

  // --- Shadow DOM ---------------------------------------------------------------

  /**
   * Pierce an open shadow root: host locator → inner CSS/text selector.
   * Playwright pierces open shadow trees via chained locators; closed roots are not accessible.
   */
  inShadow(host: Locator, inner: string): Locator {
    return host.locator(inner);
  }

  /** Same as `inShadow`, but host is resolved from a page CSS selector. */
  shadowLocator(hostSelector: string, inner: string): Locator {
    this.logger.debug(`Shadow locator: ${hostSelector} >> ${inner}`);
    return this.page.locator(hostSelector).locator(inner);
  }

  /** Deep pierce through multiple open shadow hosts: host1 >> host2 >> … >> inner. */
  deepShadowLocator(...selectors: string[]): Locator {
    if (selectors.length < 2) {
      throw new ConfigurationError('deepShadowLocator requires at least host + inner selectors', {
        action: 'deepShadowLocator',
      });
    }
    this.logger.debug(`Deep shadow locator: ${selectors.join(' >> ')}`);
    let current: Locator = this.page.locator(selectors[0]);
    for (let i = 1; i < selectors.length; i += 1) {
      current = current.locator(selectors[i]);
    }
    return current;
  }

  async clickInShadow(
    host: Locator,
    inner: string,
    name: string,
    options?: { observe?: boolean },
  ): Promise<void> {
    await this.click(this.inShadow(host, inner), name, options);
  }

  async fillInShadow(host: Locator, inner: string, name: string, value: string): Promise<void> {
    await this.fill(this.inShadow(host, inner), name, value);
  }

  async dblClickInShadow(
    host: Locator,
    inner: string,
    name: string,
    options?: { observe?: boolean },
  ): Promise<void> {
    await this.dblClick(this.inShadow(host, inner), name, options);
  }

  async press(key: string): Promise<void> {
    await this.run('press', key, async () => {
      this.logger.info(`Keyboard: ${key}`);
      await this.page.keyboard.press(key);
    });
  }

  async pressOn(locator: Locator, name: string, key: string): Promise<void> {
    await this.runWithHeal('pressOn', name, locator, async (active) => {
      this.logger.info(`Press ${key} on ${name}`);
      await active.press(key);
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
    await this.runWithHeal('waitForVisible', name, locator, async (active) => {
      await this.waits.visible(active, name, timeout);
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
    return this.runWithHeal('getText', name, locator, async (active) => {
      const text = (await active.innerText()).trim();
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
    await this.runWithHeal('assertVisible', name, locator, async (active) => {
      await this.asserts.visible(active, name);
    });
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

  async scrollIntoView(
    locator: Locator,
    name: string,
    options?: { block?: ScrollLogicalPosition; inline?: ScrollLogicalPosition },
  ): Promise<void> {
    await this.runWithHeal('scrollIntoView', name, locator, async (active) => {
      this.logger.info(`Scroll into view: ${name}`);
      if (options?.block || options?.inline) {
        await active.evaluate(
          (el, opts) => {
            el.scrollIntoView({
              block: opts.block ?? 'nearest',
              inline: opts.inline ?? 'nearest',
              behavior: 'instant',
            });
          },
          { block: options.block, inline: options.inline },
        );
        return;
      }
      await active.scrollIntoViewIfNeeded();
    });
  }

  /** Scroll the window by pixel offsets (positive Y = down). */
  async scrollBy(deltaX: number, deltaY: number): Promise<void> {
    await this.run('scrollBy', `${deltaX},${deltaY}`, async () => {
      this.logger.info(`Scroll page by (${deltaX}, ${deltaY})`);
      await this.page.evaluate(
        ({ x, y }) => window.scrollBy(x, y),
        { x: deltaX, y: deltaY },
      );
    });
  }

  /** Scroll the window to absolute document coordinates. */
  async scrollTo(x: number, y: number): Promise<void> {
    await this.run('scrollTo', `${x},${y}`, async () => {
      this.logger.info(`Scroll page to (${x}, ${y})`);
      await this.page.evaluate(({ left, top }) => window.scrollTo(left, top), { left: x, top: y });
    });
  }

  /** Scroll to the top of the page. */
  async scrollToTop(): Promise<void> {
    await this.run('scrollToTop', undefined, async () => {
      this.logger.info('Scroll to top of page');
      await this.page.evaluate(() => window.scrollTo(0, 0));
    });
  }

  /** Scroll to the bottom of the page (document height). */
  async scrollToBottom(): Promise<void> {
    await this.run('scrollToBottom', undefined, async () => {
      this.logger.info('Scroll to bottom of page');
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    });
  }

  /**
   * Scroll a scrollable container element (overflow panel) by pixel offsets.
   * Use when the page itself does not scroll but an inner div does.
   */
  async scrollElementBy(locator: Locator, name: string, deltaX: number, deltaY: number): Promise<void> {
    await this.runWithHeal('scrollElementBy', name, locator, async (active) => {
      this.logger.info(`Scroll element ${name} by (${deltaX}, ${deltaY})`);
      await active.evaluate((el, { x, y }) => el.scrollBy(x, y), { x: deltaX, y: deltaY });
    });
  }

  /** Scroll a container element to absolute scrollLeft/scrollTop. */
  async scrollElementTo(locator: Locator, name: string, left: number, top: number): Promise<void> {
    await this.runWithHeal('scrollElementTo', name, locator, async (active) => {
      this.logger.info(`Scroll element ${name} to (${left}, ${top})`);
      await active.evaluate((el, pos) => el.scrollTo(pos.left, pos.top), { left, top });
    });
  }

  /** Mouse-wheel scroll at the current pointer position (or over a locator center). */
  async mouseWheel(deltaX: number, deltaY: number, locator?: Locator, name?: string): Promise<void> {
    await this.run('mouseWheel', name || `${deltaX},${deltaY}`, async () => {
      if (locator) {
        const box = await locator.boundingBox();
        if (!box) {
          throw new ElementNotFoundError(`Cannot mouse-wheel over "${name}" — no bounding box`, {
            action: 'mouseWheel',
            locator: name,
          });
        }
        await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      }
      this.logger.info(`Mouse wheel (${deltaX}, ${deltaY})${name ? ` over ${name}` : ''}`);
      await this.page.mouse.wheel(deltaX, deltaY);
    });
  }

  /** Current window scroll position. */
  async getScrollPosition(): Promise<{ x: number; y: number }> {
    return this.run('getScrollPosition', undefined, async () => {
      return this.page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    });
  }

  // --- JavaScript execution -----------------------------------------------------

  /**
   * Run a function in the page context and return its result.
   * Prefer this for reading DOM state that locators cannot express cleanly.
   */
  async evaluate<T, Args extends unknown[] = []>(
    pageFunction: (...args: Args) => T | Promise<T>,
    ...args: Args
  ): Promise<T> {
    return this.run('evaluate', undefined, async () => {
      this.logger.info('Execute JavaScript in page context');
      return this.page.evaluate(pageFunction as never, args.length === 1 ? args[0] : args.length ? args : undefined);
    });
  }

  /**
   * Run JavaScript from a string expression/script in the page (like DevTools console).
   * Example: `await actions.evaluateScript('document.title')`
   */
  async evaluateScript<T = unknown>(script: string, arg?: unknown): Promise<T> {
    return this.run('evaluateScript', script.slice(0, 80), async () => {
      this.logger.info(`Execute JavaScript script: ${script.slice(0, 120)}`);
      if (arg === undefined) {
        return this.page.evaluate(script) as Promise<T>;
      }
      return this.page.evaluate(
        ([source, value]) => {
          // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
          const fn = new Function('arg', `return (${source});`);
          return fn(value);
        },
        [script, arg] as [string, unknown],
      ) as Promise<T>;
    });
  }

  /** Run a function on a matched element handle (locator → element). */
  async evaluateOnLocator<T, Arg = unknown>(
    locator: Locator,
    name: string,
    pageFunction: (element: Element, arg: Arg) => T | Promise<T>,
    arg?: Arg,
  ): Promise<T> {
    return this.runWithHeal('evaluateOnLocator', name, locator, async (active) => {
      this.logger.info(`Execute JavaScript on element: ${name}`);
      return active.evaluate(pageFunction as never, arg as never) as Promise<T>;
    });
  }

  /**
   * Run JavaScript and return a JSHandle (for passing handles between evaluate calls).
   * Dispose the handle when finished.
   */
  async evaluateHandle<Args extends unknown[] = []>(
    pageFunction: (...args: Args) => unknown,
    ...args: Args
  ): Promise<Awaited<ReturnType<Page['evaluateHandle']>>> {
    return this.run('evaluateHandle', undefined, async () => {
      this.logger.info('Execute JavaScript evaluateHandle in page context');
      return this.page.evaluateHandle(
        pageFunction as never,
        args.length === 1 ? args[0] : args.length ? args : undefined,
      );
    });
  }

  /** Dispatch a DOM event on an element via JavaScript (e.g. `input`, `change`, custom events). */
  async dispatchDomEvent(
    locator: Locator,
    name: string,
    eventType: string,
    eventInit?: Record<string, unknown>,
  ): Promise<void> {
    await this.runWithHeal('dispatchDomEvent', name, locator, async (active) => {
      this.logger.info(`Dispatch DOM event "${eventType}" on ${name}`);
      await active.dispatchEvent(eventType, eventInit);
    });
  }

  /** Set a value on an input/textarea via JS and optionally fire `input`/`change` events. */
  async setValueByJs(
    locator: Locator,
    name: string,
    value: string,
    options?: { emitEvents?: boolean },
  ): Promise<void> {
    await this.runWithHeal('setValueByJs', name, locator, async (active) => {
      this.logger.info(`Set value via JS: ${name}`);
      await active.evaluate(
        (el, { next, emit }) => {
          const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
          input.value = next;
          if (emit) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        },
        { next: value, emit: options?.emitEvents !== false },
      );
    });
  }

  /** Read `window` / page property path, e.g. `localStorage.token` or `document.title`. */
  async getPageProperty<T = unknown>(pathExpression: string): Promise<T> {
    return this.run('getPageProperty', pathExpression, async () => {
      this.logger.debug(`Read page property: ${pathExpression}`);
      return this.page.evaluate((expr) => {
        const parts = expr.split('.').filter(Boolean);
        let current: unknown = globalThis;
        for (const part of parts) {
          if (current == null) return undefined as T;
          current = (current as Record<string, unknown>)[part];
        }
        return current as T;
      }, pathExpression);
    });
  }

  /** `document.readyState` helper. */
  async getDocumentReadyState(): Promise<string> {
    return this.evaluate(() => document.readyState);
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
