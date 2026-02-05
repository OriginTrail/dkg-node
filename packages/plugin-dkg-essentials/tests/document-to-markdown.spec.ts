/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable turbo/no-undeclared-env-vars */

import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import {
  documentToMarkdownPlugin,
  createDocumentToMarkdownPlugin,
  createProvider,
  getAvailableProviders,
  isProviderAvailable,
} from "../dist/index.js";
import {
  createExpressApp,
  createInMemoryBlobStorage,
  createMcpServerClientPair,
  createMockDkgClient,
} from "@dkg/plugins/testing";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import express from "express";
import { Readable } from "stream";

// Mock DKG context
const mockDkgContext = {
  dkg: createMockDkgClient(),
  blob: createInMemoryBlobStorage(),
};

describe("@dkg/plugin-dkg-essentials document-to-markdown", () => {
  let mockMcpServer: McpServer;
  let mockMcpClient: Client;
  let apiRouter: express.Router;
  let app: express.Application;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    // Save original env
    originalEnv = process.env.MISTRAL_API_KEY;

    const { server, client, connect } = await createMcpServerClientPair();
    mockMcpServer = server;
    mockMcpClient = client;
    apiRouter = express.Router();

    // Setup Express app
    app = createExpressApp();

    // Initialize plugin
    documentToMarkdownPlugin(mockDkgContext, mockMcpServer, apiRouter);
    await connect();

    // Mount the router
    app.use("/", apiRouter);
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.MISTRAL_API_KEY = originalEnv;
    } else {
      delete process.env.MISTRAL_API_KEY;
    }
    sinon.restore();
  });

  describe("MCP Tool Registration", () => {
    it("should register the document-to-markdown tool", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);

      expect(tools.some((t) => t.name === "document-to-markdown")).to.equal(
        true,
      );
    });

    it("should register exactly 1 tool", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);

      expect(tools.length).to.equal(1);
    });

    it("should have correct tool configuration", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);
      const tool = tools.find((t) => t.name === "document-to-markdown");

      expect(tool).to.not.equal(undefined);
      expect(tool!.title).to.equal("Document to Markdown");
      expect(tool!.description).to.include("PDF");
      expect(tool!.description).to.include("DOCX");
      expect(tool!.description).to.include("PPTX");
      expect(tool!.description).to.include("OCR");
      expect(tool!.inputSchema).to.not.equal(undefined);
    });

    it("should have correct input schema", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);
      const tool = tools.find((t) => t.name === "document-to-markdown");

      expect(tool!.inputSchema).to.be.an("object");
      const schema = tool!.inputSchema as any;
      expect(schema.properties).to.have.property("blobId");
      expect(schema.properties).to.have.property("fileBase64");
      expect(schema.properties).to.have.property("filename");
      expect(schema.properties).to.have.property("options");
    });
  });

  describe("Provider Registry", () => {
    it("should list available providers", () => {
      const providers = getAvailableProviders();
      expect(providers).to.include("mistral");
      expect(providers).to.be.an("array");
    });

    it("should check provider availability", () => {
      expect(isProviderAvailable("mistral")).to.equal(true);
      expect(isProviderAvailable("unknown")).to.equal(false);
    });

    it("should throw for unknown provider", () => {
      expect(() => createProvider("unknown")).to.throw(
        /Unknown document conversion provider/,
      );
    });

    it("should create mistral provider when API key is set", () => {
      process.env.MISTRAL_API_KEY = "test-api-key";
      const provider = createProvider("mistral");
      expect(provider.name).to.equal("mistral");
    });

    it("should throw when mistral API key is missing", () => {
      delete process.env.MISTRAL_API_KEY;
      expect(() => createProvider("mistral")).to.throw(/MISTRAL_API_KEY/);
    });
  });

  describe("Custom Plugin Configuration", () => {
    it("should accept custom provider via config", async () => {
      // Create a mock provider
      const mockProvider = {
        name: "mock-provider",
        convert: sinon.stub().resolves({
          markdown: "# Test",
          images: [],
          pageCount: 1,
        }),
      };

      const customPlugin = createDocumentToMarkdownPlugin({
        provider: mockProvider,
      });

      const { server, client, connect } = await createMcpServerClientPair();
      customPlugin(mockDkgContext, server, express.Router());
      await connect();

      const tools = await client.listTools().then((t) => t.tools);
      expect(tools.some((t) => t.name === "document-to-markdown")).to.equal(
        true,
      );
    });

    it("should use custom provider for conversion", async () => {
      // Create a mock provider that returns specific content
      const mockProvider = {
        name: "mock-provider",
        convert: sinon.stub().resolves({
          markdown: "# Mock Converted Content",
          images: [],
          pageCount: 3,
        }),
      };

      const customPlugin = createDocumentToMarkdownPlugin({
        provider: mockProvider,
      });

      const { server, client, connect } = await createMcpServerClientPair();
      const freshBlobStorage = createInMemoryBlobStorage();
      customPlugin(
        { dkg: createMockDkgClient(), blob: freshBlobStorage },
        server,
        express.Router(),
      );
      await connect();

      const result = await client.callTool({
        name: "document-to-markdown",
        arguments: {
          filename: "test.pdf",
          fileBase64: "dGVzdCBjb250ZW50",
        },
      });

      expect(result.content).to.be.an("array");
      const text = (result.content as any[])[0].text;
      expect(text).to.include("Mock Converted Content");
      expect(text).to.include("Pages Processed:** 3");
      expect(mockProvider.convert.calledOnce).to.equal(true);
    });
  });

  describe("Input Validation", () => {
    it("should fail when neither blobId nor fileBase64 is provided", async () => {
      process.env.MISTRAL_API_KEY = "test-api-key";

      const result = await mockMcpClient.callTool({
        name: "document-to-markdown",
        arguments: { filename: "test.pdf" },
      });

      expect(result.content).to.be.an("array");
      const text = (result.content as any[])[0].text;
      expect(text).to.include("Either 'blobId' or 'fileBase64' must be provided");
    });

    it("should fail when both blobId and fileBase64 are provided", async () => {
      process.env.MISTRAL_API_KEY = "test-api-key";

      const result = await mockMcpClient.callTool({
        name: "document-to-markdown",
        arguments: {
          filename: "test.pdf",
          blobId: "some-blob-id",
          fileBase64: "c29tZS1jb250ZW50",
        },
      });

      expect(result.content).to.be.an("array");
      const text = (result.content as any[])[0].text;
      expect(text).to.include("Provide either 'blobId' or 'fileBase64', not both");
    });

    it("should fail for unsupported file types", async () => {
      process.env.MISTRAL_API_KEY = "test-api-key";

      const result = await mockMcpClient.callTool({
        name: "document-to-markdown",
        arguments: {
          filename: "test.txt",
          fileBase64: "c29tZS1jb250ZW50",
        },
      });

      expect(result.content).to.be.an("array");
      const text = (result.content as any[])[0].text;
      expect(text).to.include("Unsupported file type");
      expect(text).to.include(".txt");
    });

    it("should fail for files without extension", async () => {
      process.env.MISTRAL_API_KEY = "test-api-key";

      const result = await mockMcpClient.callTool({
        name: "document-to-markdown",
        arguments: {
          filename: "testfile",
          fileBase64: "c29tZS1jb250ZW50",
        },
      });

      expect(result.content).to.be.an("array");
      const text = (result.content as any[])[0].text;
      expect(text).to.include("Unsupported file type");
    });

    it("should fail when blob is not found", async () => {
      process.env.MISTRAL_API_KEY = "test-api-key";

      const result = await mockMcpClient.callTool({
        name: "document-to-markdown",
        arguments: {
          filename: "test.pdf",
          blobId: "non-existent-blob-id",
        },
      });

      expect(result.content).to.be.an("array");
      const text = (result.content as any[])[0].text;
      expect(text).to.include("Document blob not found");
    });
  });

  describe("API Key Validation", () => {
    it("should fail when MISTRAL_API_KEY is not set", async () => {
      delete process.env.MISTRAL_API_KEY;

      const result = await mockMcpClient.callTool({
        name: "document-to-markdown",
        arguments: {
          filename: "test.pdf",
          fileBase64: "c29tZS1jb250ZW50",
        },
      });

      expect(result.content).to.be.an("array");
      const text = (result.content as any[])[0].text;
      expect(text).to.include("MISTRAL_API_KEY");
      expect(text).to.include("environment variable is not set");
    });
  });

  describe("File Type Validation", () => {
    const supportedExtensions = [".pdf", ".docx", ".pptx"];
    const unsupportedExtensions = [".txt", ".doc", ".xls", ".jpg", ".png"];

    for (const ext of supportedExtensions) {
      it(`should accept ${ext} files`, async () => {
        process.env.MISTRAL_API_KEY = "test-api-key";

        // This will fail at the API call level, but that means it passed validation
        const result = await mockMcpClient.callTool({
          name: "document-to-markdown",
          arguments: {
            filename: `test${ext}`,
            fileBase64: "c29tZS1jb250ZW50",
          },
        });

        expect(result.content).to.be.an("array");
        const text = (result.content as any[])[0].text;
        // Should NOT contain "Unsupported file type" - it should fail later at API call
        expect(text).to.not.include("Unsupported file type");
      });
    }

    for (const ext of unsupportedExtensions) {
      it(`should reject ${ext} files`, async () => {
        process.env.MISTRAL_API_KEY = "test-api-key";

        const result = await mockMcpClient.callTool({
          name: "document-to-markdown",
          arguments: {
            filename: `test${ext}`,
            fileBase64: "c29tZS1jb250ZW50",
          },
        });

        expect(result.content).to.be.an("array");
        const text = (result.content as any[])[0].text;
        expect(text).to.include("Unsupported file type");
      });
    }
  });

  describe("File Size Validation", () => {
    it("should reject files larger than 50MB", async () => {
      process.env.MISTRAL_API_KEY = "test-api-key";

      // Create a base64 string that decodes to > 50MB
      // 50MB = 52,428,800 bytes, base64 encoding increases size by ~33%
      // So we need about 70MB of base64 data
      const largeSizeBytes = 51 * 1024 * 1024; // 51MB
      const largeBuffer = Buffer.alloc(largeSizeBytes, "x");
      const largeBase64 = largeBuffer.toString("base64");

      const result = await mockMcpClient.callTool({
        name: "document-to-markdown",
        arguments: {
          filename: "large-file.pdf",
          fileBase64: largeBase64,
        },
      });

      expect(result.content).to.be.an("array");
      const text = (result.content as any[])[0].text;
      expect(text).to.include("exceeds maximum of 50MB");
    });
  });

  describe("Blob Integration", () => {
    it("should read document from blob storage", async () => {
      process.env.MISTRAL_API_KEY = "test-api-key";

      // Create a test blob
      const testContent = Buffer.from("test pdf content");
      const { id: blobId } = await mockDkgContext.blob.create(
        Readable.toWeb(Readable.from(testContent)),
        { name: "test.pdf", mimeType: "application/pdf" },
      );

      const result = await mockMcpClient.callTool({
        name: "document-to-markdown",
        arguments: {
          filename: "test.pdf",
          blobId: blobId,
        },
      });

      expect(result.content).to.be.an("array");
      const text = (result.content as any[])[0].text;
      // Should fail at Mistral API level (not auth), meaning blob was read successfully
      expect(text).to.not.include("Document blob not found");
    });
  });
});
