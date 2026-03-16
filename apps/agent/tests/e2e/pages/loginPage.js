const { expect } = require("@playwright/test");

class LoginPage {
  constructor(page) {
    this.page = page;
    this.input_email = this.page.getByTestId("login-email-input");
    this.input_password = this.page.getByTestId("login-password-input");
    this.btn_login = this.page.getByTestId("login-submit-button");
  }

  // Helper function to wait for element to be stable (visible for at least 2 seconds)
  async waitForStableElement(locator, timeout = 30000) {
    const stableTime = 2000; // 2 seconds
    const checkInterval = 100; // Check every 100ms
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Check if element is visible
        await locator.waitFor({ state: "visible", timeout: 1000 });

        // Element is visible, now wait for it to remain stable
        let stableStart = Date.now();
        let isStable = true;

        while (Date.now() - stableStart < stableTime) {
          try {
            // Check if element is still visible
            await expect(locator).toBeVisible({ timeout: checkInterval });
            await this.page.waitForTimeout(checkInterval);
          } catch (error) {
            // Element disappeared, restart stability check
            isStable = false;
            break;
          }
        }

        if (isStable) {
          // Element has been stable for 2 seconds
          return;
        }

        // Element wasn't stable, wait a bit and try again
        await this.page.waitForTimeout(500);
      } catch (error) {
        // Element not visible yet, wait and retry
        await this.page.waitForTimeout(500);
      }
    }

    throw new Error(`Element did not become stable within ${timeout}ms`);
  }

  async attemptLogin(email, password) {
    await this.waitForStableElement(this.input_email);
    await this.input_email.fill(email);
    await this.input_password.fill(password);
    await this.btn_login.click();
    await this.page.waitForTimeout(2000);
  }

  async login(email, password, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      await this.waitForStableElement(this.input_email);
      await this.input_email.fill(email);
      await this.input_password.fill(password);
      await this.btn_login.click();

      await this.page.waitForTimeout(3000);

      const stillOnLogin = await this.input_email.isVisible().catch(() => false);
      if (!stillOnLogin) {
        return;
      }
      console.log(`Login attempt ${attempt} failed (still on login page), retrying...`);
    }
    throw new Error(`Still on login page after ${maxRetries} attempts`);
  }

  async successfullLogin() {
    await this.login("admin@gmail.com", "admin123");
    await this.waitForStableElement(this.page.getByTestId("chat-input"));
  }
}

module.exports = { LoginPage };
