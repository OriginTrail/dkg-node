import dotenv from "dotenv";
dotenv.config(); // Load .env so LLM_MODEL and OPENAI_API_KEY are available

import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { startTestServer } from "../setup/test-server";
import { createTestToken } from "../setup/test-helpers";

/**
 * Chatbot API Integration Test
 *
 * Tests that the LLM integration works end-to-end by:
 * 1. Starting the test server on a real port
 * 2. Sending a simple math question via the /llm API
 * 3. Verifying the response contains the correct answer
 */
describe("Chatbot API - LLM Integration", () => {
  let testServer: Awaited<ReturnType<typeof startTestServer>>;
  let accessToken: string;

  beforeEach(async function () {
    this.timeout(30000);
    testServer = await startTestServer();
    accessToken = await createTestToken(testServer, ["llm"]);
  });

  afterEach(async () => {
    if (testServer?.cleanup) {
      await testServer.cleanup();
    }
  });

  it("should have required environment variables", function () {
    expect(
      process.env.LLM_MODEL,
      "LLM_MODEL env var must be set (check .env locally or job env in CI)",
    ).to.be.a("string").and.not.be.empty;

    expect(
      process.env.OPENAI_API_KEY,
      "OPENAI_API_KEY env var must be set",
    ).to.be.a("string").and.not.be.empty;

    console.log(`LLM_MODEL = ${process.env.LLM_MODEL}`);
    console.log(`OPENAI_API_KEY is set: ${!!process.env.OPENAI_API_KEY}`);
  });

  it("should answer a simple math question (3+7=10) via the /llm API", async function () {
    this.timeout(60000); // 60s timeout for OpenAI API call

    const response = await fetch(`${testServer.url}/llm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "What is 3+7? Reply with just the number, nothing else.",
          },
        ],
      }),
    });

    expect(response.status).to.equal(200);

    const sseText = await response.text();
    console.log(`Raw SSE response:\n${sseText}`);

    // Parse SSE events (format: "event: <type>\ndata: <json>\n\n")
    const lines = sseText.split("\n");
    let fullContent = "";
    let sseErrors: string[] = [];

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.substring(7).trim();
      } else if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.substring(6));
          if (currentEvent === "error" && data.message) {
            sseErrors.push(data.message);
          }
          if (currentEvent === "delta" && data.content) {
            fullContent += data.content;
          }
        } catch {
          // Skip non-JSON data lines
        }
      }
    }

    // If we got SSE errors, fail with a clear message
    if (sseErrors.length > 0) {
      throw new Error(`LLM returned errors: ${sseErrors.join("; ")}`);
    }

    console.log(`LLM Response: "${fullContent.trim()}"`);

    // The response should contain "10"
    expect(fullContent).to.include("10");
  });

  it("should reject unauthenticated requests", async function () {
    this.timeout(15000);

    const response = await fetch(`${testServer.url}/llm`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
    });

    expect(response.status).to.equal(401);
  });
});
