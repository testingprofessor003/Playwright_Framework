import { IWorldOptions, World, setWorldConstructor } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page } from 'playwright';
import { PlaywrightActions } from '../utils/PlaywrightActions';
import { Assertions } from '../utils/Assertions';
import { WaitConditions } from '../utils/WaitConditions';
import { SharedBuffer } from '../shared/SharedBuffer';
import { createLogger, FrameworkLogger } from '../logger/logger';
import { env } from '../config/env';
import { LoginBusiness } from '../business/LoginBusiness';
import { CustomerBusiness } from '../business/CustomerBusiness';
import { ApplicationBusiness } from '../business/ApplicationBusiness';

export class CustomWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  actions!: PlaywrightActions;
  logger!: FrameworkLogger;
  shared!: SharedBuffer;
  runId = '';
  workerId = '';
  scenarioId = '';
  scenarioName = '';
  featureName = '';
  tags: string[] = [];
  startedAt = 0;
  stepIndex = 0;
  screenshotPath?: string;
  videoPath?: string;
  tracePath?: string;
  lastError?: unknown;
  browserName = env.browser;

  constructor(options: IWorldOptions) {
    super(options);
    this.shared = new SharedBuffer();
    this.logger = createLogger();
  }

  setActivePage(page: Page): void {
    this.page = page;
    this.actions?.setPage(page);
  }

  get waits(): WaitConditions {
    return this.actions.waits;
  }

  get asserts(): Assertions {
    return this.actions.asserts;
  }

  get login(): LoginBusiness {
    return new LoginBusiness(this);
  }

  get customer(): CustomerBusiness {
    return new CustomerBusiness(this);
  }

  get application(): ApplicationBusiness {
    return new ApplicationBusiness(this);
  }

  initLogger(): void {
    this.logger = createLogger({
      runId: this.runId,
      workerId: this.workerId,
      scenarioId: this.scenarioId,
      scenarioName: this.scenarioName,
      browser: this.browserName,
    });
  }
}

setWorldConstructor(CustomWorld);
