import { Page } from 'playwright';
import { BaseBusiness } from './BaseBusiness';
import { LoginPage } from '../pages/LoginPage';
import { env } from '../config/env';
import { requireAppCredentials } from '../config/credentials';

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
  }

  async signIn(email: string, password: string): Promise<Page> {
    const loginPage = this.pageObject(LoginPage);
    const page = await loginPage.signIn(email, password);
    this.world.setActivePage(page);
    return page;
  }

  async assertLoggedIn(): Promise<void> {
    const loginPage = this.pageObject(LoginPage);
    await loginPage.assertSignedIn();
  }
}
