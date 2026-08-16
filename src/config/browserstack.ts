import { chromium, Browser } from 'playwright';
import { version as playwrightVersion } from 'playwright/package.json';
import { env } from './env';
import { ConfigurationError, BrowserLaunchError } from '../errors/errors';

export interface BrowserStackCaps {
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  name: string;
  build: string;
  project?: string;
  resolution?: string;
  'browserstack.username': string;
  'browserstack.accessKey': string;
  'browserstack.playwrightVersion'?: string;
  'browserstack.local'?: boolean | string;
  'browserstack.video'?: boolean | string;
  'browserstack.networkLogs'?: boolean | string;
  'browserstack.debug'?: boolean | string;
  'browserstack.console'?: string;
  'client.playwrightVersion'?: string;
}

function mapBrowserStackBrowser(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized === 'firefox' || normalized === 'playwright-firefox') return 'playwright-firefox';
  if (normalized === 'webkit' || normalized === 'safari' || normalized === 'playwright-webkit') {
    return 'playwright-webkit';
  }
  if (normalized === 'edge' || normalized === 'msedge') return 'edge';
  if (normalized === 'chromium') return 'chrome';
  return name;
}

export function buildBrowserStackCaps(scenarioName: string): BrowserStackCaps {
  if (!env.browserstackUsername || !env.browserstackAccessKey) {
    throw new ConfigurationError(
      'BrowserStack credentials are missing. Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY.',
      { action: 'browserstack.connect' },
    );
  }

  const version = env.browserstackPlaywrightVersion || playwrightVersion;

  return {
    browser: mapBrowserStackBrowser(env.browserstackBrowser),
    browser_version: env.browserstackBrowserVersion,
    os: env.browserstackOs,
    os_version: env.browserstackOsVersion,
    name: scenarioName,
    build: env.browserstackBuildName,
    project: env.browserstackProjectName,
    resolution: env.browserstackResolution,
    'browserstack.username': env.browserstackUsername,
    'browserstack.accessKey': env.browserstackAccessKey,
    'browserstack.playwrightVersion': version,
    'browserstack.local': env.browserstackLocal,
    'browserstack.video': env.browserstackVideo,
    'browserstack.networkLogs': env.browserstackNetworkLogs,
    'browserstack.debug': env.browserstackDebug,
    'browserstack.console': env.browserstackConsole,
    'client.playwrightVersion': version,
  };
}

export async function connectBrowserStack(scenarioName: string): Promise<Browser> {
  try {
    const caps = buildBrowserStackCaps(scenarioName);
    const wsEndpoint = `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;
    return await chromium.connect(wsEndpoint, { timeout: env.browserstackConnectTimeout });
  } catch (error) {
    throw new BrowserLaunchError(
      `Failed to connect to BrowserStack: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'browserstack.connect', cause: error },
    );
  }
}
