const { expect } = require("@playwright/test");
const { test } = require("@playwright/test");
const { Base } = require("../utils/base");
const { LoginPage } = require("../pages/loginPage");
const { ChatbotPage } = require("../pages/chatbotPage");
const dotenv = require("dotenv");
const path = require("path");

let base;
let loginPage;
let chatbotPage;

function loadEnvFile(envFile) {
  dotenv.config({
    path: path.join(__dirname, "..", envFile),
    override: true,
  });
}

test.beforeEach(async ({ page }) => {
  base = new Base(page);
  await base.goToWebsite();
  await base.successfullLoad();
  loginPage = new LoginPage(page);
  chatbotPage = new ChatbotPage(page);
});

test("Test wrong username", async ({ page }) => {
  await loginPage.attemptLogin("invalid", "admin123");
  await expect(
    page.getByText("Invalid username or password", { exact: true }),
  ).toBeVisible();
});

test("Test wrong password", async ({ page }) => {
  await loginPage.attemptLogin("admin@gmail.com", "invalid");
  await expect(
    page.getByText("Invalid username or password", { exact: true }),
  ).toBeVisible();
});

test("Test wrong username and password", async ({ page }) => {
  await loginPage.attemptLogin("invalid", "invalid");
  await expect(
    page.getByText("Invalid username or password", { exact: true }),
  ).toBeVisible();
});

test("Test valid login", async () => {
  await loginPage.successfullLogin();
});

test.skip("Test send message and get answer @gh_actions", async ({ page }) => {
  await loginPage.successfullLogin();
  const question = "3+7";
  await chatbotPage.sendMessage(question);

  // Wait for the AI to respond
  await chatbotPage.waitForResponse(question);

  // Get the actual AI response
  const spanLocator = page.getByTestId("chat-message-text");
  const actualResponse = await spanLocator.last().textContent();
  console.log(`AI Response = "${actualResponse}"`);

  // Very flexible check: just ensure the AI responded with the correct answer (10)
  // and some indication it's doing math - order doesn't matter
  await expect(spanLocator.last()).toHaveText(
    /(?=.*(10|ten))(?=.*(sum|result|answer|calculation|plus|add|equals))/i,
  );
});
test("Test publish KA and GET UAL on Testnet", async () => {
  loadEnvFile(".env.testing.testnet.local");

  await loginPage.successfullLogin();
  const ual = await chatbotPage.publishKA();
  await chatbotPage.getUAL(ual);
});
test("Test publish KA and GET UAL on Mainnet", async () => {
  loadEnvFile(".env.testing.mainnet.local");
  await loginPage.successfullLogin();
  const ual = await chatbotPage.publishKA();
  await chatbotPage.getUAL(ual);
});
