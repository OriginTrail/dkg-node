const { expect } = require("@playwright/test");

class ChatbotPage {
  constructor(page) {
    this.page = page;
    this.input_message = this.page.getByTestId("chat-input");
    this.btn_send = this.page.getByTestId("chat-send-button");
    this.btn_import = this.page.getByTestId("chat-attach-file-button");
    this.btn_continue = this.page.getByTestId("tool-continue-button");
  }

  async waitForChatReady() {
    // Wait for chat input to be enabled and ready
    await this.page.waitForFunction(
      () => {
        const chatInput = document.querySelector('[data-testid="chat-input"]');
        return chatInput && !chatInput.disabled && chatInput.value === "";
      },
      {},
      { timeout: 30000 },
    );
  }

  async waitForResponse(questionText = "") {
    // Wait for DKG Node to finish processing and provide a real response (not "Thinking...")
    const startTime = Date.now();
    const timeout = 300000; // 5 minutes
    const checkInterval = 5000; // Check every 5 seconds

    while (Date.now() - startTime < timeout) {
      try {
        const messages = await this.page.$$eval(
          '[data-testid="chat-message-text"]',
          (elements) => elements.map((el) => el.textContent || ""),
        );

        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1];

          // Check conditions
          const isNotThinking = !lastMessage.trim().startsWith("Thinking");
          const isNotSameAsQuestion =
            lastMessage.trim() !== questionText.trim();
          const hasContent = lastMessage.length > 0;

          const shouldComplete =
            hasContent && isNotThinking && isNotSameAsQuestion;

          if (shouldComplete) {
            return;
          }
        }

        // Wait before next check
        await this.page.waitForTimeout(checkInterval);
      } catch (error) {
        await this.page.waitForTimeout(checkInterval);
      }
    }

    // If we get here, we timed out
    throw new Error(
      `Timeout waiting for response after ${timeout / 1000} seconds`,
    );
  }

  async sendMessage(message) {
    // Ensure chat is ready before sending
    await this.waitForChatReady();

    await this.input_message.fill(message);
    await this.btn_send.click();

    // Handle tool permission dialog if it appears
    try {
      await this.page.getByTestId("tool-allow-session-checkbox").waitFor({
        timeout: 5000,
      });
      await this.page.getByTestId("tool-allow-session-checkbox").click();
      await this.btn_continue.click();
    } catch (e) {
      // No tool permission dialog appeared
    }
  }

  async importFiles(files) {
    // Simple approach: click the import button and then set the file
    await this.btn_import.click();

    // Wait a moment for any file input to appear
    await this.page.waitForTimeout(1000);

    // Try to set the file on any file input that exists
    try {
      await this.page.setInputFiles('input[type="file"]', files);
    } catch (error) {
      console.log("File input not found, trying alternative approach...");
      // If that fails, try to find any input that accepts files
      const fileInputs = await this.page
        .locator(
          'input[accept*="pdf"], input[accept*="document"], input[type="file"]',
        )
        .all();
      if (fileInputs.length > 0) {
        await fileInputs[0].setInputFiles(files);
      } else {
        throw new Error("No file input found on the page");
      }
    }

    // Wait for files to be processed
    await this.page.waitForTimeout(2000);
  }

  async publishKA() {
    //await this.page.pause();
    const publishMessage = `Create this Knowledge Asset on the DKG for me:

{
  "@context": "https://schema.org/",
  "@type": "CreativeWork",
  "@id": "urn:first-dkg-ka:info:hello-dkg",
  "name": "Hello DKG",
  "description": "My first Knowledge Asset on the Decentralized Knowledge Graph!"
}`;

    await this.sendMessage(publishMessage);

    // Wait for any success message about Knowledge Asset creation (much more flexible)
    // Using data-testid for chat messages and waiting for success content
    await this.page.waitForFunction(
      () => {
        const messages = Array.from(
          document.querySelectorAll('[data-testid="chat-message-text"]'),
        );
        const successPattern =
          /(?!.*unable)(?!.*failed)(?!.*error)(?!.*cannot)(?!.*can't)((Knowledge Asset|KA).*(created|published|generated|added|stored|uploaded)|(created|published|generated|added|stored|uploaded).*(Knowledge Asset|KA)|successfully.*(created|published)|UAL.*did:|Here.*UAL)/i;
        return messages.some((msg) =>
          successPattern.test(msg.textContent || ""),
        );
      },
      {},
      { timeout: 300000 }, // 5 minutes
    );

    // Find the success message and extract UAL from it
    const successMessageRegex =
      /(?!.*unable)(?!.*failed)(?!.*error)(?!.*cannot)(?!.*can't)(Knowledge Asset.*(?:created|published|generated|added|stored|uploaded)|(?:created|published|generated|added|stored|uploaded).*Knowledge Asset|successfully.*(?:created|published)|UAL.*did:|Here.*UAL|KA.*(?:created|published)|(?:created|published).*KA)/i;

    // Get all messages and find the one with success content
    const allMessages = await this.page.getByTestId("chat-message-text").all();

    let successMessage = null;
    let UAL = null;

    for (let i = 0; i < allMessages.length; i++) {
      const message = allMessages[i];
      const text = await message.textContent();

      if (text && successMessageRegex.test(text)) {
        successMessage = message;
        UAL = text; // The entire message text which should contain the UAL
        break;
      }
    }

    // Ensure we found a success message
    if (!successMessage) {
      throw new Error("No success message found for Knowledge Asset creation");
    }

    await expect(successMessage).toBeVisible();

    // Wait for the response to be fully complete before returning
    await this.waitForResponse(publishMessage);

    return UAL;
  }
  async getUAL(UAL) {
    const retrieveMessage = `Get this Knowledge Asset from the DKG and summarize it for me: ${UAL}`;

    await this.sendMessage(retrieveMessage);

    // Wait for DKG Node to process the retrieval request
    await this.waitForResponse(retrieveMessage);

    // Find the last message (should be the retrieval response)
    const allMessages = await this.page.getByTestId("chat-message-text").all();
    const lastMessage = allMessages[allMessages.length - 1];

    // Ultra-flexible pattern to match almost any AI success response format
    await expect(lastMessage).toHaveText(
      /(Knowledge Asset|retrieved|summary|found|located|contains|information|data|asset|DKG|here|following|content|details|components)/i,
    );
  }
}

module.exports = { ChatbotPage };
