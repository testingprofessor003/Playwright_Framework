import { BaseBusiness } from './BaseBusiness';
import { ExamplePage } from '../pages/templates/ExamplePage';
import { env } from '../config/env';

const SHARED_TTL = { ttlMs: 30 * 60 * 1000 };

export class ApplicationBusiness extends BaseBusiness {
  async openApplication(url: string = env.baseUrl): Promise<void> {
    const pageObject = this.pageObject(ExamplePage);
    await pageObject.open(url);
    this.activate(pageObject);
  }

  async assertPageLoaded(): Promise<void> {
    const pageObject = this.pageObject(ExamplePage);
    await pageObject.assertLoaded();
  }

  async assertTitleNotEmpty(): Promise<void> {
    await this.asserts.titleNotEmpty();
  }

  async assertTitleContains(expected: string): Promise<void> {
    await this.asserts.title(expected);
  }

  async storePageTitle(key: string): Promise<void> {
    const title = await this.actions.getTitle();
    await this.shared.set(key, title, { scope: 'scenario' });
    await this.shared.set(key, title, { scope: 'global', ...SHARED_TTL });
    this.logger.info(`Stored shared buffer ${key}=${title}`);
  }

  async readGlobalSharedKey(key: string): Promise<void> {
    const value = await this.shared.get<string>(key, 'global');
    await this.shared.set('lastRead', value, { scope: 'scenario' });
  }

  async assertLastSharedValueExists(): Promise<void> {
    const value = await this.shared.get<string>('lastRead', 'scenario');
    if (value === undefined || value === null || value === '') {
      this.logger.warn('Global shared key was empty. This is expected if scenarios run in isolation on a fresh buffer.');
    }
  }

  async assertSharedKeyNotEmpty(key: string): Promise<void> {
    const value = await this.shared.get<string>(key, 'scenario');
    this.asserts.notEmpty(value, `Shared buffer key "${key}" was empty`, 'sharedBuffer.assert');
  }

  logBaseUrl(): void {
    this.logger.info(`BASE_URL=${env.baseUrl}`);
  }

  async waitMilliseconds(ms: number): Promise<void> {
    await this.waits.sleep(ms, 'step wait');
  }

  async takeScreenshot(name: string): Promise<Buffer> {
    return this.actions.screenshot(name, true);
  }
}
