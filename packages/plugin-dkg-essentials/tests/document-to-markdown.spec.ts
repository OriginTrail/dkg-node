/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable turbo/no-undeclared-env-vars */

import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  createDocumentToMarkdownPlugin,
  createProvider,
  getAvailableProviders,
  isProviderAvailable,
  UnpdfProvider,
  createUnpdfProvider,
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

// Mock provider for tests that don't need real OCR
const createMockProvider = (overrides?: Partial<any>) => ({
  name: "mock-provider",
  convert: sinon.stub().resolves({
    markdown: "# Mock Content",
    images: [],
    pageCount: 1,
  }),
  ...overrides,
});

// Mock DKG context
const mockDkgContext = {
  dkg: createMockDkgClient(),
  blob: createInMemoryBlobStorage(),
};

/**
 * Helper: create a PDF with the given page texts using pdf-lib.
 */
async function createTestPdf(pageTexts: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const text of pageTexts) {
    const page = doc.addPage([600, 400]);
    page.drawText(text, { x: 50, y: 350, font, size: 14 });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

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

    // Initialize plugin with a mock provider (avoids needing MISTRAL_API_KEY)
    const plugin = createDocumentToMarkdownPlugin({
      provider: createMockProvider(),
    });
    plugin(mockDkgContext, mockMcpServer, apiRouter);
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
      expect(providers).to.include("unpdf");
      expect(providers).to.be.an("array");
    });

    it("should check provider availability", () => {
      expect(isProviderAvailable("mistral")).to.equal(true);
      expect(isProviderAvailable("unpdf")).to.equal(true);
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

    it("should create unpdf provider without config", () => {
      const provider = createProvider("unpdf");
      expect(provider.name).to.equal("unpdf");
    });
  });

  describe("Custom Plugin Configuration", () => {
    it("should accept custom provider via config", async () => {
      const customPlugin = createDocumentToMarkdownPlugin({
        provider: createMockProvider(),
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
      const mockProvider = createMockProvider({
        convert: sinon.stub().resolves({
          markdown: "# Mock Converted Content",
          images: [],
          pageCount: 3,
        }),
      });

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
      const result = await mockMcpClient.callTool({
        name: "document-to-markdown",
        arguments: { filename: "test.pdf" },
      });

      expect(result.content).to.be.an("array");
      const text = (result.content as any[])[0].text;
      expect(text).to.include("Either 'blobId' or 'fileBase64' must be provided");
    });

    it("should fail when both blobId and fileBase64 are provided", async () => {
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

  describe("Provider Initialization", () => {
    it("should initialize plugin without any env vars (unpdf default)", async () => {
      delete process.env.MISTRAL_API_KEY;

      const plugin = createDocumentToMarkdownPlugin();
      const { server } = await createMcpServerClientPair();
      expect(() =>
        plugin(mockDkgContext, server, express.Router()),
      ).to.not.throw();
    });

    it("should require MISTRAL_API_KEY when explicitly selecting mistral", async () => {
      delete process.env.MISTRAL_API_KEY;

      const plugin = createDocumentToMarkdownPlugin({
        providerName: "mistral",
      });
      const { server } = await createMcpServerClientPair();
      expect(() =>
        plugin(mockDkgContext, server, express.Router()),
      ).to.throw(/MISTRAL_API_KEY/);
    });

    it("should initialize plugin when MISTRAL_API_KEY is set and mistral selected", async () => {
      process.env.MISTRAL_API_KEY = "test-api-key";

      const plugin = createDocumentToMarkdownPlugin({
        providerName: "mistral",
      });
      const { server } = await createMcpServerClientPair();
      expect(() =>
        plugin(mockDkgContext, server, express.Router()),
      ).to.not.throw();
    });
  });

  describe("File Type Validation", () => {
    const supportedExtensions = [".pdf", ".docx", ".pptx"];
    const unsupportedExtensions = [".txt", ".doc", ".xls", ".jpg", ".png"];

    for (const ext of supportedExtensions) {
      it(`should accept ${ext} files`, async () => {
        const result = await mockMcpClient.callTool({
          name: "document-to-markdown",
          arguments: {
            filename: `test${ext}`,
            fileBase64: "c29tZS1jb250ZW50",
          },
        });

        expect(result.content).to.be.an("array");
        const text = (result.content as any[])[0].text;
        // Should NOT contain "Unsupported file type" - mock provider handles conversion
        expect(text).to.not.include("Unsupported file type");
      });
    }

    for (const ext of unsupportedExtensions) {
      it(`should reject ${ext} files`, async () => {
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
      // Create a buffer > 50MB, then base64-encode it for the tool input.
      // The size check validates the decoded byte length, not the base64 string length.
      const largeSizeBytes = 51 * 1024 * 1024; // 51MB decoded, exceeds the 50MB limit
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
      // Should not fail with "Document blob not found" - blob was read successfully
      expect(text).to.not.include("Document blob not found");
    });
  });

  describe("UnpdfProvider", () => {
    let provider: InstanceType<typeof UnpdfProvider>;

    beforeEach(() => {
      provider = createUnpdfProvider();
    });

    describe("Format Rejection", () => {
      it("should reject .docx files", async () => {
        const buffer = Buffer.from("fake docx content");
        try {
          await provider.convert(buffer, "document.docx");
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.message).to.include("only supports .pdf");
          expect(err.message).to.include("Mistral");
        }
      });

      it("should reject .pptx files", async () => {
        const buffer = Buffer.from("fake pptx content");
        try {
          await provider.convert(buffer, "presentation.pptx");
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.message).to.include("only supports .pdf");
          expect(err.message).to.include("Mistral");
        }
      });

      it("should reject files without extension", async () => {
        const buffer = Buffer.from("no extension");
        try {
          await provider.convert(buffer, "noextension");
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.message).to.include("only supports .pdf");
        }
      });
    });

    describe("PDF Conversion", () => {
      it("should convert a simple PDF to markdown", async () => {
        const pdfBuffer = await createTestPdf([
          "Hello from page one",
          "Hello from page two",
        ]);

        const result = await provider.convert(pdfBuffer, "test.pdf");

        expect(result.markdown).to.include("Hello from page one");
        expect(result.markdown).to.include("Hello from page two");
      });

      it("should return correct pageCount", async () => {
        const pdfBuffer = await createTestPdf(["Page 1", "Page 2", "Page 3"]);

        const result = await provider.convert(pdfBuffer, "test.pdf");

        expect(result.pageCount).to.equal(3);
      });

      it("should include page separators in output", async () => {
        const pdfBuffer = await createTestPdf(["First", "Second"]);

        const result = await provider.convert(pdfBuffer, "test.pdf");

        expect(result.markdown).to.include("<!-- Page 1 -->");
        expect(result.markdown).to.include("<!-- Page 2 -->");
      });

      it("should return empty images array", async () => {
        const pdfBuffer = await createTestPdf(["Some text"]);

        const result = await provider.convert(pdfBuffer, "test.pdf");

        expect(result.images).to.deep.equal([]);
      });

      it("should respect pageStart/pageEnd options", async () => {
        const pdfBuffer = await createTestPdf([
          "Page one text",
          "Page two text",
          "Page three text",
        ]);

        const result = await provider.convert(pdfBuffer, "test.pdf", {
          pageStart: 2,
          pageEnd: 2,
        });

        expect(result.markdown).to.include("Page two text");
        expect(result.markdown).to.not.include("Page one text");
        expect(result.markdown).to.not.include("Page three text");
        // Page separator should reflect the actual page number
        expect(result.markdown).to.include("<!-- Page 2 -->");
        // Total pageCount should still be the full document count
        expect(result.pageCount).to.equal(3);
      });

      it("should handle pageStart only (no pageEnd)", async () => {
        const pdfBuffer = await createTestPdf([
          "Page one text",
          "Page two text",
          "Page three text",
        ]);

        const result = await provider.convert(pdfBuffer, "test.pdf", {
          pageStart: 2,
        });

        expect(result.markdown).to.not.include("Page one text");
        expect(result.markdown).to.include("Page two text");
        expect(result.markdown).to.include("Page three text");
        expect(result.markdown).to.include("<!-- Page 2 -->");
        expect(result.markdown).to.include("<!-- Page 3 -->");
      });

      it("should handle pageEnd only (no pageStart)", async () => {
        const pdfBuffer = await createTestPdf([
          "Page one text",
          "Page two text",
          "Page three text",
        ]);

        const result = await provider.convert(pdfBuffer, "test.pdf", {
          pageEnd: 2,
        });

        expect(result.markdown).to.include("Page one text");
        expect(result.markdown).to.include("Page two text");
        expect(result.markdown).to.not.include("Page three text");
        expect(result.markdown).to.include("<!-- Page 1 -->");
        expect(result.markdown).to.include("<!-- Page 2 -->");
      });

      it("should convert single-page PDF", async () => {
        const pdfBuffer = await createTestPdf(["Only page"]);

        const result = await provider.convert(pdfBuffer, "test.pdf");

        expect(result.markdown).to.include("Only page");
        expect(result.markdown).to.include("<!-- Page 1 -->");
        expect(result.pageCount).to.equal(1);
      });
    });
  });
});
