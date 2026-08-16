import {
  chromium,
  firefox,
  webkit,
  Browser,
  BrowserContext,
  BrowserContextOptions,
  LaunchOptions,
  Page,
} from 'playwright';
import { env, BrowserName } from './env';
import { ConfigurationError } from '../errors/errors';
import { logger } from '../logger/logger';
import { DOWNLOADS_DIR, VIDEOS_DIR } from './paths';
import { shouldRecordArtifact } from './artifacts';

const launchers = {
  chromium,
  firefox,
  webkit,
};

const CHROMIUM_CHANNELS = new Set([
  'chrome',
  'chrome-beta',
  'chrome-dev',
  'chrome-canary',
  'msedge',
  'msedge-beta',
  'msedge-dev',
  'msedge-canary',
]);

const FIREFOX_DOWNLOAD_MIMES = [
  'application/pdf',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
].join(',');

export function resolveBrowserName(name: string = env.browser): BrowserName {
  const normalized = name.toLowerCase();
  if (
    normalized === 'chrome' ||
    normalized === 'chromium' ||
    normalized === 'msedge' ||
    normalized === 'edge' ||
    CHROMIUM_CHANNELS.has(normalized)
  ) {
    return 'chromium';
  }
  if (normalized === 'firefox') return 'firefox';
  if (normalized === 'webkit' || normalized === 'safari') return 'webkit';
  throw new ConfigurationError(`Unsupported browser: ${name}`, { action: 'resolveBrowser' });
}

export function resolveBrowserChannel(): string | undefined {
  const explicit = env.browserChannel;
  if (CHROMIUM_CHANNELS.has(explicit)) return explicit;

  const requested = (process.env.BROWSER || env.browser || '').toLowerCase();
  if (requested === 'chrome') return 'chrome';
  if (requested === 'msedge' || requested === 'edge') return 'msedge';
  if (CHROMIUM_CHANNELS.has(requested)) return requested;
  return undefined;
}

export function getViewportSize(): { width: number; height: number } {
  return { width: env.viewportWidth, height: env.viewportHeight };
}

function launchProxy(): LaunchOptions['proxy'] {
  if (!env.proxyServer) return undefined;
  return {
    server: env.proxyServer,
    ...(env.proxyUsername ? { username: env.proxyUsername } : {}),
    ...(env.proxyPassword ? { password: env.proxyPassword } : {}),
  };
}

function sharedLaunchOptions(): LaunchOptions {
  return {
    headless: env.headless,
    slowMo: env.slowMo,
    timeout: env.launchTimeout,
    downloadsPath: DOWNLOADS_DIR,
    proxy: launchProxy(),
  };
}

function chromiumArgs(): string[] {
  const { width, height } = getViewportSize();
  const args = [
    '--disable-notifications',
    '--disable-dev-shm-usage',
    '--disable-infobars',
    '--disable-popup-blocking',
    '--no-first-run',
    '--no-default-browser-check',
    '--deny-permission-prompts',
  ];

  if (env.headless) {
    args.push(`--window-size=${width},${height}`, '--hide-scrollbars');
  } else if (env.maximizeWindow) {
    args.push('--start-maximized');
  } else {
    args.push(`--window-size=${width},${height}`);
  }

  return [...args, ...env.browserArgs];
}

function firefoxLaunchOptions(): LaunchOptions {
  const downloadDir = DOWNLOADS_DIR.replace(/\\/g, '/');
  return {
    ...sharedLaunchOptions(),
    args: env.browserArgs.length ? env.browserArgs : undefined,
    firefoxUserPrefs: {
      'dom.webnotifications.enabled': false,
      'dom.push.enabled': false,
      'permissions.default.desktop-notification': 2,
      'permissions.default.geo': 2,
      'permissions.default.camera': 2,
      'permissions.default.microphone': 2,
      'media.navigator.permission.disabled': true,
      'app.update.enabled': false,
      'app.update.auto': false,
      'browser.shell.checkDefaultBrowser': false,
      'browser.startup.page': 0,
      'browser.startup.homepage': 'about:blank',
      'startup.homepage_welcome_url': 'about:blank',
      'datareporting.healthreport.uploadEnabled': false,
      'datareporting.policy.dataSubmissionEnabled': false,
      'toolkit.telemetry.enabled': false,
      'toolkit.telemetry.rejected': true,
      'signon.rememberSignons': false,
      'browser.formfill.enable': false,
      'browser.download.useDownloadDir': true,
      'browser.download.folderList': 2,
      'browser.download.dir': downloadDir,
      'browser.download.manager.showWhenStarting': false,
      'browser.helperApps.neverAsk.saveToDisk': FIREFOX_DOWNLOAD_MIMES,
      'pdfjs.disabled': true,
      'network.cookie.cookieBehavior': 0,
      'privacy.trackingprotection.enabled': false,
    },
  };
}

function webkitLaunchOptions(): LaunchOptions {
  return {
    ...sharedLaunchOptions(),
    args: env.browserArgs.length ? env.browserArgs : undefined,
  };
}

export function getLaunchOptions(name: BrowserName = resolveBrowserName()): LaunchOptions {
  if (name === 'firefox') return firefoxLaunchOptions();
  if (name === 'webkit') return webkitLaunchOptions();

  return {
    ...sharedLaunchOptions(),
    channel: resolveBrowserChannel(),
    chromiumSandbox: env.chromiumSandbox,
    args: chromiumArgs(),
  };
}

function shouldUseOsWindow(): boolean {
  return !env.headless && env.maximizeWindow && env.executionEnv !== 'browserstack';
}

function contextPermissions(name: BrowserName): string[] {
  if (env.permissions.length) return env.permissions;
  if (name === 'chromium') return ['clipboard-read', 'clipboard-write'];
  return [];
}

export function getContextOptions(options: { storageState?: string } = {}): BrowserContextOptions {
  const name = resolveBrowserName();
  const viewportSize = getViewportSize();
  const useOsWindow = shouldUseOsWindow();

  const contextOptions: BrowserContextOptions = {
    baseURL: env.baseUrl,
    ignoreHTTPSErrors: env.ignoreHttpsErrors,
    acceptDownloads: env.acceptDownloads,
    bypassCSP: env.bypassCsp,
    locale: env.locale,
    extraHTTPHeaders: {
      'Accept-Language': env.locale,
      ...env.extraHttpHeaders,
    },
    permissions: contextPermissions(name),
    viewport: useOsWindow ? null : viewportSize,
    recordVideo: shouldRecordArtifact(env.video)
      ? { dir: VIDEOS_DIR, size: viewportSize }
      : undefined,
    storageState: options.storageState,
    proxy: launchProxy(),
  };

  if (!useOsWindow) {
    contextOptions.screen = viewportSize;
    if (env.deviceScaleFactor) contextOptions.deviceScaleFactor = env.deviceScaleFactor;
  }
  if (env.timezone) contextOptions.timezoneId = env.timezone;
  if (env.colorScheme) contextOptions.colorScheme = env.colorScheme;
  if (env.userAgent) contextOptions.userAgent = env.userAgent;

  return contextOptions;
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
  if (env.headless || !env.maximizeWindow || env.executionEnv === 'browserstack') {
    return;
  }

  const name = resolveBrowserName();
  if (name === 'chromium') {
    try {
      const session = await context.newCDPSession(page);
      const { windowId } = await session.send('Browser.getWindowForTarget');
      await session.send('Browser.setWindowBounds', {
        windowId,
        bounds: { windowState: 'maximized' },
      });
      logger.info('Browser window maximized');
      return;
    } catch {
      logger.debug('CDP maximize is not available on this browser; using JS window size');
    }
  }

  try {
    const size = await page.evaluate(() => ({
      width: window.screen.availWidth,
      height: window.screen.availHeight,
    }));
    await page.evaluate(() => {
      window.moveTo(0, 0);
      window.resizeTo(window.screen.availWidth, window.screen.availHeight);
    });
    if (page.viewportSize()) {
      await page.setViewportSize(size);
    }
    logger.info(`Browser window sized to ${size.width}x${size.height}`);
  } catch {
    logger.debug('Could not resize the browser window; using context viewport');
  }
}
