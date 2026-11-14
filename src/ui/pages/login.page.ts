import { BasePage } from './base.page';

/**
 * Exists for the negative authentication cases only. No test signs in through
 * this page during normal runs — authorization is injected by the framework
 * (ADR 0004).
 */
export class LoginPage extends BasePage {
  readonly emailInput = this.page.locator('input[name="email"]');
  readonly passwordInput = this.page.locator('input[name="password"]');
  readonly submitButton = this.page.getByRole('button', { name: 'Sign In' });
  readonly registerLink = this.page.getByRole('link', { name: 'Register' });

  async goto(): Promise<void> {
    await this.open('/login');
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
