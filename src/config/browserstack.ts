import { chromium, Browser } from 'playwright';
import { env } from './env';
import { ConfigurationError, BrowserLaunchError } from '../errors/errors';

export interface BrowserStackCaps {
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  name: string;
  build: string;
  'browserstack.username': string;
  'browserstack.accessKey': string;
  'client.playwrightVersion'?: string;
}

export function buildBrowserStackCaps(scenarioName: string): BrowserStackCaps {
  if (!env.browserstackUsername || !env.browserstackAccessKey) {
    throw new ConfigurationError(
      'BrowserStack credentials are missing. Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY.',
      { action: 'browserstack.connect' },
    );
  }

  return {
    browser: env.browserstackBrowser,
    browser_version: env.browserstackBrowserVersion,
    os: env.browserstackOs,
    os_version: env.browserstackOsVersion,
    name: scenarioName,
    build: env.browserstackBuildName,
    'browserstack.username': env.browserstackUsername,
    'browserstack.accessKey': env.browserstackAccessKey,
  };
}

export async function connectBrowserStack(scenarioName: string): Promise<Browser> {
  try {
    const caps = buildBrowserStackCaps(scenarioName);
    const wsEndpoint = `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;
    return await chromium.connect(wsEndpoint);
  } catch (error) {
    throw new BrowserLaunchError(
      `Failed to connect to BrowserStack: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'browserstack.connect', cause: error },
    );
  }
}
