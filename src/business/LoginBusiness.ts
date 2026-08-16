import { Page } from 'playwright';
import { BaseBusiness } from './BaseBusiness';
import { LoginPage } from '../pages/LoginPage';
import { env } from '../config/env';
import { requireAppCredentials } from '../config/credentials';
import {
  hasSavedManagerSession,
  MANAGER_STORAGE_STATE,
  saveManagerSession,
  withManagerSessionLock,
} from '../auth/managerSession';

export class LoginBusiness extends BaseBusiness {
  async launchCoreBanking(): Promise<void> {
    const loginPage = this.pageObject(LoginPage);
    await loginPage.open(env.baseUrl);
    this.activate(loginPage);
  }

  async launchAt(url: string): Promise<void> {
    await this.actions.launchApplication(url);
  }

  async launchInNewWindow(url: string): Promise<void> {
    const page = await this.actions.launchApplicationInNewWindow(url);
    this.world.setActivePage(page);
  }

  async switchToWindowByUrl(url: string): Promise<void> {
    const page = await this.actions.switchToWindowByUrl(url);
    this.world.setActivePage(page);
  }

  async switchToWindowIndex(index: number): Promise<void> {
    const page = await this.actions.switchToWindowByIndex(index);
    this.world.setActivePage(page);
  }

  async switchToParentWindow(): Promise<void> {
    const page = await this.actions.switchToParentWindow();
    this.world.setActivePage(page);
  }

  async signInWithValidCredentials(): Promise<void> {
    const { email, password } = requireAppCredentials();
    await this.signIn(email, password);
    await saveManagerSession(this.context);
  }

  async signIn(email: string, password: string): Promise<Page> {
    const loginPage = this.pageObject(LoginPage);
    const page = await loginPage.signIn(email, password);
    this.world.setActivePage(page);
    return page;
  }

  /**
   * Loads cookies/localStorage from a previous UI login. Distinct from
   * "I sign in with valid credentials", which always types email and password.
   * First use in a run signs in through the UI once and saves storageState.
   */
  async reuseSavedBankManagerSession(): Promise<void> {
    await withManagerSessionLock(async () => {
      if (hasSavedManagerSession()) {
        await this.applySavedManagerSession();
        const loginPage = this.pageObject(LoginPage);
        if (!(await loginPage.isOnLoginScreen())) {
          this.logger.info('Reused saved bank manager session; skipped UI sign-in');
          await loginPage.assertSignedIn();
          return;
        }
        this.logger.warn('Saved bank manager session expired; signing in through the UI');
      } else {
        this.logger.info('No saved bank manager session; signing in through the UI once and saving it');
      }

      const { email, password } = requireAppCredentials();
      await this.signIn(email, password);
      await saveManagerSession(this.context);
    });
  }

  private async applySavedManagerSession(): Promise<void> {
    this.logger.info(`Loading bank manager storageState from ${MANAGER_STORAGE_STATE}`);
    await this.world.recreateContext(MANAGER_STORAGE_STATE);
    await this.launchCoreBanking();
  }

  async assertLoggedIn(): Promise<void> {
    const loginPage = this.pageObject(LoginPage);
    await loginPage.assertSignedIn();
  }
}
