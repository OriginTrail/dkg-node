import { expect } from "chai";
import request from "supertest";
import { startTestServer } from "../setup/test-server";
import {
  callMcpTool,
  createTestToken,
  initializeMcpSession,
} from "../setup/test-helpers";

function parseMcpPayload(result: any): Record<string, any> {
  const firstContent = result.result?.content?.[0];
  if (!firstContent?.text) return {};
  return JSON.parse(firstContent.text);
}

describe("EPCIS Authorization Integration", () => {
  let testServer: Awaited<ReturnType<typeof startTestServer>>;

  beforeEach(async function () {
    this.timeout(15000);
    testServer = await startTestServer();
  });

  afterEach(async () => {
    if (testServer?.cleanup) {
      await testServer.cleanup();
    }
  });

  describe("Missing token handling", () => {
    it("returns 401 for EPCIS API and MCP transport without token", async () => {
      await request(testServer.app)
        .get("/epcis/events")
        .query({ bizStep: "receiving" })
        .expect(401);

      await request(testServer.app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "epcis-auth-test", version: "1.0.0" },
          },
        })
        .expect(401);
    });
  });

  describe("MCP-only token", () => {
    it("denies EPCIS MCP tools with 403-equivalent payload", async () => {
      const mcpOnlyToken = await createTestToken(
        testServer,
        ["mcp"],
        "epcis-mcp-only",
      );
      const sessionId = await initializeMcpSession(
        testServer.app,
        mcpOnlyToken,
      );

      const readResult = await callMcpTool(
        testServer.app,
        mcpOnlyToken,
        sessionId,
        "epcis-query",
        { bizStep: "receiving" },
      );
      const readPayload = parseMcpPayload(readResult);

      expect(readResult.result.isError).to.equal(true);
      expect(readPayload.error).to.equal("Forbidden");
      expect(readPayload.statusCode).to.equal(403);
      expect(readPayload.requiredScope).to.equal("epcis.read");

      const writeResult = await callMcpTool(
        testServer.app,
        mcpOnlyToken,
        sessionId,
        "epcis-capture",
        {
          epcisDocument: { type: "NotAnEPCIS" },
        },
      );
      const writePayload = parseMcpPayload(writeResult);

      expect(writeResult.result.isError).to.equal(true);
      expect(writePayload.error).to.equal("Forbidden");
      expect(writePayload.statusCode).to.equal(403);
      expect(writePayload.requiredScope).to.equal("epcis.write");

      const statusResult = await callMcpTool(
        testServer.app,
        mcpOnlyToken,
        sessionId,
        "epcis-capture-status",
        { captureID: "123" },
      );
      const statusPayload = parseMcpPayload(statusResult);
      expect(statusResult.result.isError).to.equal(true);
      expect(statusPayload.error).to.equal("Forbidden");
      expect(statusPayload.statusCode).to.equal(403);
      expect(statusPayload.requiredScope).to.equal("epcis.write");
    });
  });

  describe("Read-only scope", () => {
    it("allows event reads and denies capture/status for API and MCP", async () => {
      const apiReadToken = await createTestToken(
        testServer,
        ["epcis.read"],
        "epcis-api-read-only",
      );
      await request(testServer.app)
        .get("/epcis/events")
        .set("Authorization", `Bearer ${apiReadToken}`)
        .query({ bizStep: "receiving" })
        .expect(200);
      await request(testServer.app)
        .post("/epcis/capture")
        .set("Authorization", `Bearer ${apiReadToken}`)
        .send({ epcisDocument: { type: "NotAnEPCIS" } })
        .expect(403);
      await request(testServer.app)
        .get("/epcis/capture/123")
        .set("Authorization", `Bearer ${apiReadToken}`)
        .expect(403);

      const mcpReadToken = await createTestToken(
        testServer,
        ["mcp", "epcis.read"],
        "epcis-mcp-read-only",
      );
      const sessionId = await initializeMcpSession(
        testServer.app,
        mcpReadToken,
      );

      const readResult = await callMcpTool(
        testServer.app,
        mcpReadToken,
        sessionId,
        "epcis-query",
        { bizStep: "receiving" },
      );
      expect(readResult.result.isError).to.not.equal(true);

      const writeResult = await callMcpTool(
        testServer.app,
        mcpReadToken,
        sessionId,
        "epcis-capture",
        { epcisDocument: { type: "NotAnEPCIS" } },
      );
      const writePayload = parseMcpPayload(writeResult);
      expect(writeResult.result.isError).to.equal(true);
      expect(writePayload.error).to.equal("Forbidden");
      expect(writePayload.statusCode).to.equal(403);

      const statusResult = await callMcpTool(
        testServer.app,
        mcpReadToken,
        sessionId,
        "epcis-capture-status",
        { captureID: "123" },
      );
      const statusPayload = parseMcpPayload(statusResult);
      expect(statusResult.result.isError).to.equal(true);
      expect(statusPayload.error).to.equal("Forbidden");
      expect(statusPayload.statusCode).to.equal(403);
      expect(statusPayload.requiredScope).to.equal("epcis.write");
    });
  });

  describe("Write-only scope", () => {
    it("allows capture/status and denies event reads for API and MCP", async () => {
      const apiWriteToken = await createTestToken(
        testServer,
        ["epcis.write"],
        "epcis-api-write-only",
      );
      await request(testServer.app)
        .post("/epcis/capture")
        .set("Authorization", `Bearer ${apiWriteToken}`)
        .send({ epcisDocument: { type: "NotAnEPCIS" } })
        .expect(400);
      await request(testServer.app)
        .get("/epcis/events")
        .set("Authorization", `Bearer ${apiWriteToken}`)
        .query({ bizStep: "receiving" })
        .expect(403);
      await request(testServer.app)
        .get("/epcis/capture/123")
        .set("Authorization", `Bearer ${apiWriteToken}`)
        .then((response) => {
          expect(response.status).to.not.equal(401);
          expect(response.status).to.not.equal(403);
        });

      const mcpWriteToken = await createTestToken(
        testServer,
        ["mcp", "epcis.write"],
        "epcis-mcp-write-only",
      );
      const sessionId = await initializeMcpSession(
        testServer.app,
        mcpWriteToken,
      );

      const captureResult = await callMcpTool(
        testServer.app,
        mcpWriteToken,
        sessionId,
        "epcis-capture",
        { epcisDocument: { type: "NotAnEPCIS" } },
      );
      const capturePayload = parseMcpPayload(captureResult);
      expect(captureResult.result.isError).to.equal(true);
      expect(capturePayload.error).to.equal("Invalid EPCISDocument");

      const statusResult = await callMcpTool(
        testServer.app,
        mcpWriteToken,
        sessionId,
        "epcis-capture-status",
        { captureID: "123" },
      );
      const statusPayload = parseMcpPayload(statusResult);
      expect(statusResult.result.isError).to.equal(true);
      expect(statusPayload.error).to.not.equal("Forbidden");

      const readResult = await callMcpTool(
        testServer.app,
        mcpWriteToken,
        sessionId,
        "epcis-query",
        { bizStep: "receiving" },
      );
      const readPayload = parseMcpPayload(readResult);
      expect(readResult.result.isError).to.equal(true);
      expect(readPayload.error).to.equal("Forbidden");
      expect(readPayload.statusCode).to.equal(403);
    });
  });

  describe("Read + write scopes", () => {
    it("allows all EPCIS paths (auth pass) for API and MCP", async () => {
      const apiToken = await createTestToken(
        testServer,
        ["epcis.read", "epcis.write"],
        "epcis-api-read-write",
      );
      await request(testServer.app)
        .get("/epcis/events")
        .set("Authorization", `Bearer ${apiToken}`)
        .query({ bizStep: "receiving" })
        .expect(200);
      await request(testServer.app)
        .post("/epcis/capture")
        .set("Authorization", `Bearer ${apiToken}`)
        .send({ epcisDocument: { type: "NotAnEPCIS" } })
        .expect(400);
      await request(testServer.app)
        .get("/epcis/capture/123")
        .set("Authorization", `Bearer ${apiToken}`)
        .then((response) => {
          expect(response.status).to.not.equal(401);
          expect(response.status).to.not.equal(403);
        });

      const mcpToken = await createTestToken(
        testServer,
        ["mcp", "epcis.read", "epcis.write"],
        "epcis-mcp-read-write",
      );
      const sessionId = await initializeMcpSession(testServer.app, mcpToken);

      const readResult = await callMcpTool(
        testServer.app,
        mcpToken,
        sessionId,
        "epcis-query",
        { bizStep: "receiving" },
      );
      expect(readResult.result.isError).to.not.equal(true);

      const captureResult = await callMcpTool(
        testServer.app,
        mcpToken,
        sessionId,
        "epcis-capture",
        { epcisDocument: { type: "NotAnEPCIS" } },
      );
      const capturePayload = parseMcpPayload(captureResult);
      expect(captureResult.result.isError).to.equal(true);
      expect(capturePayload.error).to.equal("Invalid EPCISDocument");

      const statusResult = await callMcpTool(
        testServer.app,
        mcpToken,
        sessionId,
        "epcis-capture-status",
        { captureID: "123" },
      );
      const statusPayload = parseMcpPayload(statusResult);
      expect(statusResult.result.isError).to.equal(true);
      expect(statusPayload.error).to.not.equal("Forbidden");
    });
  });
});
