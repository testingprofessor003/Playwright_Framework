import { Locator, Page } from 'playwright';
import { WaitConditions } from './WaitConditions';

export { WaitConditions, sleep } from './WaitConditions';
export { Assertions } from './Assertions';

export async function waitForStable(locator: Locator, timeout = 5000): Promise<void> {
  const waits = new WaitConditions(locator.page());
  await waits.stable(locator, 'element', timeout);
}

export async function waitForNetworkIdle(page: Page, timeout = 15000): Promise<void> {
  const waits = new WaitConditions(page);
  await waits.networkIdle(timeout);
}
