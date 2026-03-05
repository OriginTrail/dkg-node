/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import request from "supertest";
import { dkgToolsPlugin } from "../dist/index.js";
import {
  getExplorerUrl,
  withSourceKnowledgeAssets,
  serializeSourceKAContent,
  parseSourceKAContent,
} from "../dist/utils.js";
import {
  createExpressApp,
  createInMemoryBlobStorage,
  createMcpServerClientPair,
  createMockDkgClient,
} from "@dkg/plugins/testing";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import express from "express";
import { Blob } from "buffer";

// Mock DKG context
const mockDkgContext = {
  dkg: createMockDkgClient(),
  blob: createInMemoryBlobStorage(),
};

mockDkgContext.dkg.asset = {
  // @ts-expect-error Mock definition differs from the original implementation
  get: (ual: string) =>
    Promise.resolve({
      public: {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Test Asset",
        description: "Mock test asset data",
      },
      metadata: {
        UAL: ual,
        createdAt: "2024-01-01T00:00:00Z",
      },
    }),
  create: () =>
    Promise.resolve({
      UAL: "did:dkg:otp:20430/0x123456/12345",
    }),
};
mockDkgContext.dkg.graph = {
  query: (query: string, queryType: string) =>
    Promise.resolve({
      data: [{ query, queryType, result: "ok" }],
    }),
};

describe("@dkg/plugin-dkg-essentials checks", () => {
  let mockMcpServer: McpServer;
  let mockMcpClient: Client;
  let apiRouter: express.Router;
  let app: express.Application;

  beforeEach(async () => {
    const { server, client, connect } = await createMcpServerClientPair();
    mockMcpServer = server;
    mockMcpClient = client;
    apiRouter = express.Router();

    // Setup Express app
    app = createExpressApp();

    // Initialize plugin
    dkgToolsPlugin(mockDkgContext, mockMcpServer, apiRouter);
    await connect();

    // Mount the router
    app.use("/", apiRouter);
  });

  describe("MCP Tool Registration", () => {
    it("should register the dkg-get tool", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);

      expect(tools.some((t) => t.name === "dkg-get")).to.equal(true);
    });

    it("should register the dkg-create tool", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);

      expect(tools.some((t) => t.name === "dkg-create")).to.equal(true);
    });

    it("should register the dkg-sparql-query tool", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);

      expect(tools.some((t) => t.name === "dkg-sparql-query")).to.equal(true);
    });

    it("should register exactly 3 tools", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);

      expect(tools.length).to.equal(3);
    });

    it("should have correct dkg-get tool configuration", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);
      const dkgGetTool = tools.find((t) => t.name === "dkg-get");

      expect(dkgGetTool).to.not.equal(undefined);
      expect(dkgGetTool!.title).to.equal("DKG Knowledge Asset get tool");
      expect(dkgGetTool!.description).to.include("Retrieve a specific");
      expect(dkgGetTool!.description).to.include("UAL");
      expect(dkgGetTool!.inputSchema).to.not.equal(undefined);
    });

    it("should have correct dkg-create tool configuration", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);
      const dkgCreateTool = tools.find((t) => t.name === "dkg-create");

      expect(dkgCreateTool).to.not.equal(undefined);
      expect(dkgCreateTool!.title).to.equal("DKG Knowledge Asset create tool");
      expect(dkgCreateTool!.description).to.include("creating and publishing");
      expect(dkgCreateTool!.description).to.include("JSON-LD");
      expect(dkgCreateTool!.inputSchema).to.not.equal(undefined);
    });
  });

  describe("MCP Resource Registration", () => {
    it("should register the dkg-knowledge-asset resource", async () => {
      const resources = await mockMcpClient
        .listResourceTemplates()
        .then((r) => r.resourceTemplates);

      expect(resources.some((r) => r.name === "dkg-knowledge-asset")).to.equal(
        true,
      );
    });

    it("should register the dkg-knowledge-collection resource", async () => {
      const resources = await mockMcpClient
        .listResourceTemplates()
        .then((r) => r.resourceTemplates);

      expect(
        resources.some((r) => r.name === "dkg-knowledge-collection"),
      ).to.equal(true);
    });

    it("should register exactly 2 resources", async () => {
      const resources = await mockMcpClient
        .listResourceTemplates()
        .then((r) => r.resourceTemplates);

      expect(resources.length).to.equal(2);
    });

    it("should have correct dkg-knowledge-asset resource configuration", async () => {
      const resources = await mockMcpClient
        .listResourceTemplates()
        .then((r) => r.resourceTemplates);
      const assetResource = resources.find(
        (r) => r.name === "dkg-knowledge-asset",
      );

      expect(assetResource).to.not.equal(undefined);
      expect(assetResource!.title).to.equal("DKG Knowledge Asset");
      expect(assetResource!.description).to.include("Knowledge Assets");
      expect(assetResource!.uriTemplate).to.not.equal(undefined);
    });

    it("should have correct dkg-knowledge-collection resource configuration", async () => {
      const resources = await mockMcpClient
        .listResourceTemplates()
        .then((r) => r.resourceTemplates);
      const collectionResource = resources.find(
        (r) => r.name === "dkg-knowledge-collection",
      );

      expect(collectionResource).to.not.equal(undefined);
      expect(collectionResource!.title).to.equal("DKG Knowledge Collection");
      expect(collectionResource!.description).to.include(
        "Knowledge Collections",
      );
      expect(collectionResource!.uriTemplate).to.not.equal(undefined);
    });
  });

  describe("DKG Get Tool Functionality", () => {
    it("should retrieve knowledge asset by UAL", async () => {
      const testUal = "did:dkg:otp:20430/0x123456/12345";
      const result = await mockMcpClient.callTool({
        name: "dkg-get",
        arguments: { ual: testUal },
      });

      expect(result.content).to.be.an("array");
      expect((result.content as any[])[0].type).to.equal("text");
      expect((result.content as any[])[0].text).to.be.a("string");

      // Verify the returned data is valid JSON
      const parsedResult = JSON.parse((result.content as any[])[0].text);
      expect(parsedResult).to.be.an("object");
      expect(parsedResult.public).to.exist;
      expect(parsedResult.metadata).to.exist;
    });

    it("should handle UAL parameter correctly", async () => {
      const testUal = "did:dkg:otp:20430/0x987654/54321";
      const result = await mockMcpClient.callTool({
        name: "dkg-get",
        arguments: { ual: testUal },
      });
      const parsedResult = JSON.parse((result.content as any[])[0].text);

      expect(parsedResult.metadata.UAL).to.equal(testUal);
    });

    it("should format response as valid JSON", async () => {
      const result = await mockMcpClient.callTool({
        name: "dkg-get",
        arguments: { ual: "test-ual" },
      });

      expect(() =>
        JSON.parse((result.content as any[])[0].text),
      ).to.not.throw();
    });
  });

  describe("DKG Create Tool Functionality", () => {
    it("should create knowledge asset with valid JSON-LD", async () => {
      const testJsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Test Organization",
        description: "A test organization",
      });
      const result = await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: {
          jsonld: testJsonLd,
          privacy: "private",
        },
      });

      expect(result.content).to.be.an("array");
      expect((result.content as any[])[0].type).to.equal("text");
      expect((result.content as any[])[0].text).to.include(
        "Knowledge Asset collection successfully created",
      );
      expect((result.content as any[])[0].text).to.include("UAL:");
      expect((result.content as any[])[0].text).to.include(
        "DKG Explorer link:",
      );
    });

    it("should create knowledge asset with valid JSON-LD file id as input", async () => {
      const testJsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Test Organization",
        description: "A test organization",
      });
      const { id } = await mockDkgContext.blob.create(
        new Blob([testJsonLd]).stream(),
        {
          name: "test-jsonld.json",
          mimeType: "application/json",
        },
      );
      const result = await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: {
          jsonld: id,
          privacy: "private",
        },
      });

      expect(result.content).to.be.an("array");
      expect((result.content as any)[0].type).to.equal("text");
      expect((result.content as any)[0].text).to.include(
        "Knowledge Asset collection successfully created",
      );
      expect((result.content as any)[0].text).to.include("UAL:");
      expect((result.content as any)[0].text).to.include("DKG Explorer link:");
    });

    it("should default to private privacy when not specified", async () => {
      const testJsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Person",
        name: "Test Person",
      });
      const result = await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: {
          jsonld: testJsonLd,
        },
      });

      expect((result.content as any[])[0].text).to.include(
        "successfully created",
      );
    });

    it("should handle public privacy setting", async () => {
      const testJsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Event",
        name: "Test Event",
      });
      const result = await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: {
          jsonld: testJsonLd,
          privacy: "public",
        },
      });

      expect((result.content as any[])[0].text).to.include(
        "successfully created",
      );
    });

    it("should throw error when no JSON-LD content provided", async () => {
      const result = await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: { jsonld: "" },
      });

      expect(result.isError).to.be.true;
      expect((result.content as any[])[0].text).to.include(
        "No JSON-LD content provided",
      );
    });

    it("should include UAL in response", async () => {
      const testJsonLd = JSON.stringify({ "@type": "Thing" });
      const result = await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: { jsonld: testJsonLd },
      });

      expect((result.content as any[])[0].text).to.include(
        "did:dkg:otp:20430/0x123456/12345",
      );
    });
  });

  describe("Resource Handler Functionality", () => {
    it("should handle knowledge asset resource requests", async () => {
      const mockUal = "did:dkg:otp:20430/0x123456/12345/1";
      const result = await mockMcpClient.readResource({ uri: mockUal });

      expect(result.contents).to.be.an("array");
      expect(result.contents[0].uri).to.equal(mockUal);
      expect(result.contents[0].text).to.be.a("string");

      // Verify the returned data is valid JSON
      const parsedResult = JSON.parse((result.contents as any[])[0].text);
      expect(parsedResult).to.be.an("object");
    });

    it("should handle knowledge collection resource requests", async () => {
      const mockUal = "did:dkg:otp:20430/0x123456/12345";
      const result = await mockMcpClient.readResource({ uri: mockUal });

      expect(result.contents).to.be.an("array");
      expect(result.contents[0].uri).to.equal(mockUal);
      expect(result.contents[0].text).to.be.a("string");
    });

    it("should convert UAL href to lowercase", async () => {
      const mockUal = "did:dkg:OTP:20430/0X123456/12345";
      const result = await mockMcpClient.readResource({ uri: mockUal });

      expect(result.contents[0].uri).to.equal(mockUal);
      // The handler should call ctx.dkg.asset.get with lowercase UAL
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid JSON-LD in create tool", async () => {
      // Override mock to simulate error
      const originalCreate = mockDkgContext.dkg.asset.create;
      mockDkgContext.dkg.asset.create = () => {
        throw new Error("Invalid JSON-LD format");
      };

      const result = await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: {
          jsonld: '{ "invalid": "jsonld" }',
          privacy: "private",
        },
      });

      expect(result.isError).to.be.true;
      expect((result.content as any[])[0].text).to.include(
        "Failed to create asset",
      );

      // Restore original mock
      mockDkgContext.dkg.asset.create = originalCreate;
    });

    it("should handle DKG service errors in get tool", async () => {
      // Override mock to simulate error
      const originalGet = mockDkgContext.dkg.asset.get;
      mockDkgContext.dkg.asset.get = () => {
        throw new Error("DKG service unavailable");
      };

      const result = await mockMcpClient.callTool({
        name: "dkg-get",
        arguments: { ual: "test-ual" },
      });

      expect(result.isError).to.be.true;
      expect((result.content as any[])[0].text).to.include(
        "DKG service unavailable",
      );

      // Restore original mock
      mockDkgContext.dkg.asset.get = originalGet;
    });

    it("should handle DKG service errors in SPARQL tool", async () => {
      const originalQuery = mockDkgContext.dkg.graph.query;
      try {
        mockDkgContext.dkg.graph.query = () => {
          throw new Error("DKG query unavailable");
        };

        const result = await mockMcpClient.callTool({
          name: "dkg-sparql-query",
          arguments: { query: "SELECT * WHERE { ?s ?p ?o } LIMIT 1" },
        });

        expect((result.content as any[])[0].text).to.include(
          "Error executing SPARQL query",
        );
        expect((result.content as any[])[0].text).to.include(
          "DKG query unavailable",
        );
      } finally {
        mockDkgContext.dkg.graph.query = originalQuery;
      }
    });
  });

  describe("HTTP API Routes", () => {
    it("should expose POST /api/dkg/create from Essentials", async () => {
      const response = await request(app)
        .post("/api/dkg/create")
        .send({
          jsonld: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "HTTP Create Test Organization",
          }),
          privacy: "private",
        })
        .expect(200);

      expect(response.body.success).to.equal(true);
      expect(response.body.data.ual).to.equal("did:dkg:otp:20430/0x123456/12345");
      expect(response.body.data.explorerLink).to.include(
        "https://dkg-testnet.origintrail.io/explore?ual=",
      );
    });

    it("should return 400 for invalid POST /api/dkg/create input", async () => {
      await request(app)
        .post("/api/dkg/create")
        .send({
          privacy: "private",
        })
        .expect(400);
    });

    it("should expose POST /api/dkg/query from Essentials", async () => {
      const response = await request(app)
        .post("/api/dkg/query")
        .send({
          query: "SELECT * WHERE { ?s ?p ?o } LIMIT 1",
          queryType: "SELECT",
        })
        .expect(200);

      expect(response.body.success).to.equal(true);
      expect(response.body.data.data[0].result).to.equal("ok");
    });

    it("should return 400 for invalid POST /api/dkg/query input", async () => {
      const response = await request(app)
        .post("/api/dkg/query")
        .send({
          query: "bad query",
          queryType: "SELECT",
        })
        .expect(400);

      expect(response.body.success).to.equal(false);
      expect(response.body.error).to.be.a("string");
    });

    it("should return 400 for unsupported POST /api/dkg/query queryType", async () => {
      await request(app)
        .post("/api/dkg/query")
        .send({
          query: "SELECT * WHERE { ?s ?p ?o } LIMIT 1",
          queryType: "ASK",
        })
        .expect(400);
    });

    it("should expose GET /api/dkg/get from Essentials", async () => {
      const response = await request(app)
        .get("/api/dkg/get")
        .query({ ual: "did:dkg:otp:20430/0x123456/12345" })
        .expect(200);

      expect(response.body.success).to.equal(true);
      expect(response.body.data.metadata.UAL).to.equal(
        "did:dkg:otp:20430/0x123456/12345",
      );
    });
  });

  describe("Utility Functions", () => {
    describe("getExplorerUrl", () => {
      it("should generate correct explorer URL", () => {
        const ual = "did:dkg:otp:20430/0x123456/12345";
        const expectedUrl =
          "https://dkg-testnet.origintrail.io/explore?ual=did:dkg:otp:20430/0x123456/12345";

        expect(getExplorerUrl(ual)).to.equal(expectedUrl);
      });

      it("should handle empty UAL", () => {
        const ual = "";
        const expectedUrl = "https://dkg-testnet.origintrail.io/explore?ual=";

        expect(getExplorerUrl(ual)).to.equal(expectedUrl);
      });

      it("should handle special characters in UAL", () => {
        const ual = "did:dkg:test/with-special@chars";
        const expectedUrl =
          "https://dkg-testnet.origintrail.io/explore?ual=did:dkg:test/with-special@chars";

        expect(getExplorerUrl(ual)).to.equal(expectedUrl);
      });
    });

    describe("withSourceKnowledgeAssets", () => {
      it("should append source knowledge assets to content", () => {
        const originalData = {
          content: [{ type: "text" as const, text: "Original content" }],
        };
        const kas = [
          {
            title: "Test Asset",
            issuer: "Test Issuer",
            ual: "did:dkg:test/123",
          },
        ];
        const result = withSourceKnowledgeAssets(originalData, kas);

        expect(result.content).to.have.length(2);
        expect(result.content[0]).to.deep.equal(originalData.content[0]);
        expect(result.content[1].type).to.equal("text");
        expect(result.content[1].text).to.include(
          "**Source Knowledge Assets:**",
        );
        expect(result.content[1].text).to.include("Test Asset");
        expect(result.content[1].text).to.include("Test Issuer");
      });

      it("should handle multiple knowledge assets", () => {
        const originalData = {
          content: [{ type: "text" as const, text: "Original content" }],
        };
        const kas = [
          { title: "Asset 1", issuer: "Issuer 1", ual: "did:dkg:test/1" },
          { title: "Asset 2", issuer: "Issuer 2", ual: "did:dkg:test/2" },
        ];
        const result = withSourceKnowledgeAssets(originalData, kas);

        expect(result.content[1].text).to.include("Asset 1");
        expect(result.content[1].text).to.include("Asset 2");
        expect(result.content[1].text).to.include("Issuer 1");
        expect(result.content[1].text).to.include("Issuer 2");
      });

      it("should handle empty knowledge assets array", () => {
        const originalData = {
          content: [{ type: "text" as const, text: "Original content" }],
        };
        const kas: any[] = [];
        const result = withSourceKnowledgeAssets(originalData, kas);

        expect(result.content).to.have.length(2);
        expect(result.content[1].text).to.equal(
          "**Source Knowledge Assets:**\n",
        );
      });
    });

    describe("serializeSourceKAContent", () => {
      it("should serialize knowledge assets correctly", () => {
        const kas = [
          {
            title: "Test Asset",
            issuer: "Test Issuer",
            ual: "did:dkg:test/123",
          },
        ];
        const result = serializeSourceKAContent(kas);

        expect(result.type).to.equal("text");
        expect(result.text).to.include("**Source Knowledge Assets:**");
        expect(result.text).to.include("**Test Asset**: Test Issuer");
        expect(result.text).to.include("[did:dkg:test/123]");
        expect(result.text).to.include(
          "https://dkg-testnet.origintrail.io/explore?ual=did:dkg:test/123",
        );
        expect((result as any)._meta.description).to.be.a("string");
      });
    });

    describe("parseSourceKAContent", () => {
      it("should parse serialized knowledge assets", () => {
        const content = {
          type: "text" as const,
          text: "**Source Knowledge Assets:**\n- **Test Asset**: Test Issuer\n  [did:dkg:test/123](https://dkg-testnet.origintrail.io/explore?ual=did:dkg:test/123)",
        };
        const result = parseSourceKAContent(content);

        expect(result).to.not.be.null;
        expect(result).to.have.length(1);
        expect(result![0].title).to.equal("Test Asset");
        expect(result![0].issuer).to.equal("Test Issuer");
        expect(result![0].ual).to.equal("did:dkg:test/123");
      });

      it("should return null for non-text content", () => {
        const content = {
          type: "image" as any,
          text: "some text",
        };
        const result = parseSourceKAContent(content);

        expect(result).to.be.null;
      });

      it("should return null for text without knowledge assets", () => {
        const content = {
          type: "text" as const,
          text: "Just some regular text without knowledge assets",
        };
        const result = parseSourceKAContent(content);

        expect(result).to.be.null;
      });
    });
  });

  describe("Asset Creation Options", () => {
    it("should call asset.create with correct options", async () => {
      const spy = sinon.spy(mockDkgContext.dkg.asset, "create");

      const testJsonLd = JSON.stringify({ "@type": "Thing" });
      await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: { jsonld: testJsonLd, privacy: "private" },
      });

      expect(spy.calledOnce).to.be.true;
      const [data, options] = spy.firstCall.args as unknown as [any, any];
      expect(data).to.deep.equal({ private: { "@type": "Thing" } });
      expect(options).to.deep.equal({
        epochsNum: 2,
        minimumNumberOfFinalizationConfirmations: 3,
        minimumNumberOfNodeReplications: 1,
      });

      spy.restore();
    });

    it("should wrap data correctly for public privacy", async () => {
      const spy = sinon.spy(mockDkgContext.dkg.asset, "create");

      const testJsonLd = JSON.stringify({ "@type": "Thing" });
      await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: { jsonld: testJsonLd, privacy: "public" },
      });

      const [data] = spy.firstCall.args as unknown as [any];
      expect(data).to.deep.equal({ public: { "@type": "Thing" } });

      spy.restore();
    });
  });

  describe("Resource Handler Options", () => {
    it("should call asset.get with includeMetadata for knowledge asset resource", async () => {
      const spy = sinon.spy(mockDkgContext.dkg.asset, "get");

      const mockUal = "did:dkg:BLK:1/0x123/123/1";
      await mockMcpClient.readResource({ uri: mockUal });

      expect(spy.calledOnce).to.be.true;
      const [ual, options] = spy.firstCall.args as unknown as [string, any];
      expect(ual).to.equal(mockUal.toLowerCase()); // Should be lowercase
      expect(options).to.deep.equal({ includeMetadata: true });

      spy.restore();
    });

    it("should call asset.get with includeMetadata for knowledge collection resource", async () => {
      const spy = sinon.spy(mockDkgContext.dkg.asset, "get");

      const mockUal = "did:dkg:BLK:1/0x123/123";
      await mockMcpClient.readResource({ uri: mockUal });

      expect(spy.calledOnce).to.be.true;
      const [ual, options] = spy.firstCall.args as unknown as [string, any];

      expect(ual).to.equal(mockUal.toLowerCase()); // Should be lowercase
      expect(options).to.deep.equal({ includeMetadata: true });

      spy.restore();
    });
  });

  describe("Console Logging", () => {
    let consoleLogSpy: sinon.SinonSpy;
    let consoleErrorSpy: sinon.SinonSpy;

    beforeEach(() => {
      consoleLogSpy = sinon.spy(console, "log");
      consoleErrorSpy = sinon.spy(console, "error");
    });

    afterEach(() => {
      consoleLogSpy.restore();
      consoleErrorSpy.restore();
    });

    it("should log formatted response on successful asset creation", async () => {
      const testJsonLd = JSON.stringify({ "@type": "Thing" });
      await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: { jsonld: testJsonLd },
      });

      expect(consoleLogSpy.calledOnce).to.be.true;
      expect((consoleLogSpy.firstCall.args as any[])[0]).to.equal(
        "Formatted response:",
      );
      expect((consoleLogSpy.firstCall.args as any[])[1]).to.include(
        "Knowledge Asset collection successfully created",
      );
    });

    it("should log error on asset creation failure", async () => {
      // Override mock to simulate error
      const originalCreate = mockDkgContext.dkg.asset.create;
      mockDkgContext.dkg.asset.create = () => {
        throw new Error("Test error");
      };

      try {
        await mockMcpClient.callTool({
          name: "dkg-create",
          arguments: { jsonld: "{}" },
        });

        expect.fail("Should have thrown an error");
      } catch {
        expect(consoleErrorSpy.calledOnce).to.be.true;
        expect((consoleErrorSpy.firstCall.args as any[])[0]).to.equal(
          "Error creating asset:",
        );
        expect((consoleErrorSpy.firstCall.args as any[])[1]).to.equal(
          "Test error",
        );
      }

      // Restore original mock
      mockDkgContext.dkg.asset.create = originalCreate;
    });

    it("should log error when no JSON-LD content provided", async () => {
      try {
        await mockMcpClient.callTool({
          name: "dkg-create",
          arguments: { jsonld: "" },
        });

        expect.fail("Should have thrown an error");
      } catch {
        expect(consoleErrorSpy.calledOnce).to.be.true;
        expect((consoleErrorSpy.firstCall.args as any[])[0]).to.equal(
          "No JSON-LD content provided after file read.",
        );
      }
    });
  });

  describe("Edge Cases and Validation", () => {
    it("should handle malformed JSON in asset creation", async () => {
      const result = await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: { jsonld: "{ invalid json }" },
      });

      expect(result.isError).to.be.true;
      expect((result.content as any[])[0].text).to.include(
        "Failed to create asset",
      );
    });

    it("should handle undefined UAL from asset creation", async () => {
      // Override mock to return undefined UAL
      const originalCreate = mockDkgContext.dkg.asset.create;
      mockDkgContext.dkg.asset.create = () => Promise.resolve({} as any);

      const result = await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: { jsonld: "{}" },
      });

      // Should still return a response but with null UAL
      expect((result.content as any[])[0].text).to.include(
        "Knowledge Asset collection successfully created",
      );
      expect((result.content as any[])[0].text).to.include("UAL: null");
      expect((result.content as any[])[0].text).to.include(
        "DKG Explorer link:",
      );

      // Restore original mock
      mockDkgContext.dkg.asset.create = originalCreate;
    });

    it("should handle very long UAL strings", async () => {
      const longUal = "did:dkg:test/" + "a".repeat(1000);
      const result = await mockMcpClient.callTool({
        name: "dkg-get",
        arguments: { ual: longUal },
      });

      expect((result.content as any[])[0].text).to.be.a("string");
      // Should not throw any errors
    });

    it("should handle empty privacy string as private", async () => {
      const spy = sinon.spy(mockDkgContext.dkg.asset, "create");

      const testJsonLd = JSON.stringify({ "@type": "Thing" });
      await mockMcpClient.callTool({
        name: "dkg-create",
        arguments: { jsonld: testJsonLd, privacy: undefined },
      });

      const [data] = spy.firstCall.args as unknown as [any];
      expect(data).to.deep.equal({ private: { "@type": "Thing" } });

      spy.restore();
    });
  });
});
