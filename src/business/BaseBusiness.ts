import { BrowserContext, Page } from 'playwright';
import { CustomWorld } from '../world/CustomWorld';
import { BasePage } from '../pages/BasePage';
import { FrameworkLogger } from '../logger/logger';
import { PlaywrightActions } from '../utils/PlaywrightActions';
import { Assertions } from '../utils/Assertions';
import { WaitConditions } from '../utils/WaitConditions';
import { SharedBuffer } from '../shared/SharedBuffer';

type PageConstructor<T extends BasePage> = new (
  page: Page,
  logger: FrameworkLogger,
  context?: BrowserContext,
) => T;

export class BaseBusiness {
  constructor(protected readonly world: CustomWorld) {}

  protected get page(): Page {
    return this.world.page;
  }

  protected get logger(): FrameworkLogger {
    return this.world.logger;
  }

  protected get context(): BrowserContext {
    return this.world.context;
  }

  protected get actions(): PlaywrightActions {
    return this.world.actions;
  }

  protected get waits(): WaitConditions {
    return this.world.waits;
  }

  protected get asserts(): Assertions {
    return this.world.asserts;
  }

  protected get shared(): SharedBuffer {
    return this.world.shared;
  }

  protected pageObject<T extends BasePage>(PageClass: PageConstructor<T>): T {
    const instance = new PageClass(this.world.page, this.world.logger, this.world.context);
    instance.setPage(this.world.page);
    return instance;
  }

  protected activate(pageObject: BasePage): void {
    this.world.setActivePage(pageObject.getPage());
  }
}
