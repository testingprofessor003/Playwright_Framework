import { chromium, firefox, webkit, Browser, BrowserContext, LaunchOptions, Page } from 'playwright';
import { env, BrowserName } from './env';
import { ConfigurationError } from '../errors/errors';
import { logger } from '../logger/logger';

const launchers = {
  chromium,
  firefox,
  webkit,
};

export function resolveBrowserName(name: string = env.browser): BrowserName {
  const normalized = name.toLowerCase();
  if (normalized === 'chrome' || normalized === 'chromium' || normalized === 'msedge' || normalized === 'edge') {
    return 'chromium';
  }
  if (normalized === 'firefox') return 'firefox';
  if (normalized === 'webkit' || normalized === 'safari') return 'webkit';
  throw new ConfigurationError(`Unsupported browser: ${name}`, { action: 'resolveBrowser' });
}

export function resolveBrowserChannel(): 'chrome' | 'msedge' | 'chrome-beta' | 'msedge-beta' | undefined {
  const explicit = env.browserChannel;
  if (explicit === 'chrome' || explicit === 'msedge' || explicit === 'chrome-beta' || explicit === 'msedge-beta') {
    return explicit;
  }

  const requested = (process.env.BROWSER || env.browser || '').toLowerCase();
  if (requested === 'chrome') return 'chrome';
  if (requested === 'msedge' || requested === 'edge') return 'msedge';
  return undefined;
}

export function getLaunchOptions(name: BrowserName = resolveBrowserName()): LaunchOptions {
  const channel = name === 'chromium' ? resolveBrowserChannel() : undefined;
  const headless = env.headless;

  if (name === 'firefox') {
    return {
      headless,
      slowMo: env.slowMo,
      firefoxUserPrefs: {
        'dom.webnotifications.enabled': false,
        'dom.push.enabled': false,
        'permissions.default.desktop-notification': 2,
      },
    };
  }

  const args =
    name === 'chromium'
      ? ['--start-maximized', '--disable-notifications', '--disable-dev-shm-usage']
      : undefined;

  return {
    headless,
    slowMo: env.slowMo,
    channel,
    args,
  };
}

export function getContextOptions(): {
  viewport: null;
  ignoreHTTPSErrors: boolean;
  baseURL: string;
  permissions: string[];
} {
  return {
    viewport: null,
    ignoreHTTPSErrors: true,
    baseURL: env.baseUrl,
    permissions: [],
  };
}

export async function launchLocalBrowser(name: BrowserName = resolveBrowserName()): Promise<Browser> {
  const launcher = launchers[name];
  const options = getLaunchOptions(name);
  const channel = options.channel || 'bundled';
  logger.info(
    `Launching ${channel === 'bundled' ? `Playwright ${name}` : `installed ${channel}`} (${options.headless ? 'headless' : 'headed'})`,
  );

  try {
    return await launcher.launch(options);
  } catch (error) {
    if (!options.channel) {
      throw error;
    }
    logger.warn(
      `Could not launch installed ${options.channel}. Falling back to Playwright ${name} in headed mode. ${
        error instanceof Error ? error.message : error
      }`,
    );
    const { channel: _channel, ...withoutChannel } = options;
    return launcher.launch({ ...withoutChannel, headless: false });
  }
}

export async function maximizeWindow(page: Page, context: BrowserContext): Promise<void> {
  try {
    const session = await context.newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'maximized' },
    });
    logger.info('Browser window maximized');
  } catch {
    logger.debug('CDP maximize is not available on this browser; using start-maximized / OS window size');
  }
}
