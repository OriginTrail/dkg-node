/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import dkgPublisherPlugin from "../dist/index.mjs";
import express from "express";
import request from "supertest";
import {
  createExpressApp,
  createInMemoryBlobStorage,
  createMcpServerClientPair,
  createMockDkgClient,
} from "@dkg/plugins/testing";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Mock DKG context
const mockDkgContext = {
  dkg: createMockDkgClient(),
  blob: createInMemoryBlobStorage(),
};

// Helper functions for creating test data
const createTestAsset = (overrides: any = {}) => ({
  content: {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Test Organization",
    description: "A test organization for DKG publishing",
    ...overrides.content
  },
  metadata: {
    source: "test-source",
    sourceId: "test-123",
    ...overrides.metadata
  },
  publishOptions: {
    privacy: "public",
    priority: 50,
    ...overrides.publishOptions
  },
  ...overrides
});

describe("@dkg/plugin-dkg-publisher checks", () => {
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
    app = createExpressApp() as any;

    // Initialize plugin
    dkgPublisherPlugin(mockDkgContext, mockMcpServer, apiRouter as any);
    await connect();

    // Mount the router
    app.use("/", apiRouter as any);
  });

  afterEach(async () => {
    // Cleanup if needed
  });

  describe("Plugin Registration and Setup", () => {
    it("should register the knowledge-asset-publish MCP tool", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);

      expect(tools.length).to.equal(1);
      expect(tools[0].name).to.equal("knowledge-asset-publish");
    });

    it("should have correct MCP tool configuration", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);

      const publishTool = tools.find((tool) => tool.name === "knowledge-asset-publish");
      expect(publishTool).to.not.equal(undefined);
      expect(publishTool!.title).to.equal("Publish Knowledge Asset");
      expect(publishTool!.description).to.include(
        "Register a JSON-LD asset for publishing to the DKG",
      );
      expect(publishTool!.description).to.include("async queue");
      expect(publishTool!.inputSchema).to.not.equal(undefined);
      expect((publishTool!.inputSchema as any).publishOptions).to.not.equal(
        undefined,
      );
      expect((publishTool!.inputSchema as any).privacy).to.equal(undefined);
      expect((publishTool!.inputSchema as any).priority).to.equal(undefined);
      expect((publishTool!.inputSchema as any).epochs).to.equal(undefined);
      expect((publishTool!.inputSchema as any).maxAttempts).to.equal(undefined);
    });

    it("should register API routes correctly", async () => {
      const routes = [
        "/api/dkg/metrics/queue",
        "/api/dkg/metrics/wallets", 
        "/admin/queues"
      ];

      for (const route of routes) {
        const response = await request(app).get(route);
        // Should not be 404 (route not found) - should be 503 (service unavailable)
        expect(response.status).to.not.equal(404);
      }
    });

    it("should handle plugin initialization gracefully", async () => {
      expect(app).to.not.equal(undefined);
      expect(apiRouter).to.not.equal(undefined);
      
      const response = await request(app).get("/api/dkg/metrics/queue");
      expect(response.status).to.equal(503); // Service unavailable, not 500 (server error)
    });
  });

  describe("Input Validation and Error Handling", () => {
    it("should validate required fields in asset registration", async () => {
      const incompleteAsset = {
        metadata: {
          source: "test-source",
          sourceId: "test-123"
        }
      };

      const response = await request(app)
        .post("/api/dkg/assets")
        .send(incompleteAsset)
        .expect(400);

      expect(response.body).to.have.property("error");
      expect(response.body.error).to.include("content");
    });

    it("should handle malformed JSON requests properly", async () => {
      try {
        await request(app)
          .post("/api/dkg/assets")
          .set("Content-Type", "application/json")
          .send("{ invalid json }")
          .expect(400);
      } catch (error) {
        expect(error).to.be.an("error");
        expect(error.message).to.include("SyntaxError");
      }
    });

    it("should validate MCP tool input schema correctly", async () => {
      const invalidAsset = {
        invalidField: "test"
      };

      try {
        await mockMcpClient.callTool({
          name: "knowledge-asset-publish",
          arguments: invalidAsset,
        });
      } catch (error) {
        expect(error).to.be.an("error");
        expect(error.message).to.include("content");
      }
    });
  });

  describe("Data Structure Processing", () => {
    it("should accept optional async publish controls", async () => {
      const withPublishControls = createTestAsset({
        publishOptions: {
          privacy: "public",
          priority: 25,
          epochs: 4,
          maxAttempts: 5,
        },
      });

      const result = await mockMcpClient.callTool({
        name: "knowledge-asset-publish",
        arguments: withPublishControls,
      });

      expect(result.content).to.be.an("array");
      expect(result.content).to.have.length.greaterThan(0);
    });

    it("should process different content types correctly", async () => {
      const stringContent = createTestAsset({ 
        content: { 
          "@context": "https://schema.org",
          "@type": "Text",
          text: "Simple string content for testing"
        }
      });

      const result = await mockMcpClient.callTool({
        name: "knowledge-asset-publish",
        arguments: stringContent,
      });

      expect(result.content).to.be.an("array");
      expect(result.content).to.have.length.greaterThan(0);
    });

    it("should handle complex JSON-LD structures", async () => {
      const complexAsset = createTestAsset({
        content: {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Complex Test Organization",
          description: "A complex organization with multiple properties",
          address: {
            "@type": "PostalAddress",
            streetAddress: "123 Test St",
            addressLocality: "Test City",
            addressRegion: "Test State",
            postalCode: "12345",
            addressCountry: "US"
          },
          contactPoint: {
            "@type": "ContactPoint",
            telephone: "+1-555-123-4567",
            contactType: "customer service"
          }
        }
      });

      const result = await mockMcpClient.callTool({
        name: "knowledge-asset-publish",
        arguments: complexAsset,
      });

      expect(result.content).to.be.an("array");
      expect(result.content).to.have.length.greaterThan(0);
    });

    it("should validate and process metadata correctly", async () => {
      const assetWithMetadata = createTestAsset({
        metadata: {
          source: "test-source-with-validation",
          sourceId: "test-123-validation",
          priority: 75,
          tags: ["test", "validation", "metadata"]
        }
      });

      const result = await mockMcpClient.callTool({
        name: "knowledge-asset-publish",
        arguments: assetWithMetadata,
      });

      expect(result.content).to.be.an("array");
      expect(result.content).to.have.length.greaterThan(0);
    });
  });

  describe("Edge Cases and Input Processing", () => {
    it("should handle very large asset content without crashing", async () => {
      const largeContent = createTestAsset({
        content: {
          data: "x".repeat(10000), // 10KB string
          metadata: "Large content test"
        }
      });

      const result = await mockMcpClient.callTool({
        name: "knowledge-asset-publish",
        arguments: largeContent,
      });

      expect(result.content).to.be.an("array");
      expect(result.content).to.have.length.greaterThan(0);
    });

    it("should handle special characters in metadata correctly", async () => {
      const specialCharAsset = createTestAsset({
        content: { 
          "@context": "https://schema.org",
          "@type": "Text",
          text: "Test content with special chars"
        },
        metadata: {
          source: "test-source-with-special-chars-!@#$%^&*()",
          sourceId: "id-with-unicode-测试-🚀"
        }
      });

      const result = await mockMcpClient.callTool({
        name: "knowledge-asset-publish",
        arguments: specialCharAsset,
      });

      expect(result.content).to.be.an("array");
      expect(result.content).to.have.length.greaterThan(0);
    });

    it("should handle different asset content structures", async () => {
      const contentTypes = [
        { "@context": "https://schema.org", "@type": "Text", text: "Simple text content" },
        { "@context": "https://schema.org", "@type": "Article", headline: "Test Article", author: "Test Author" },
        { "@context": "https://schema.org", "@type": "Event", name: "Test Event", startDate: "2024-01-01" },
        { "@context": "https://schema.org", "@type": "Person", name: "Test Person", jobTitle: "Developer" }
      ];

      for (const contentType of contentTypes) {
        const assetWithContent = createTestAsset({ content: contentType });

        const result = await mockMcpClient.callTool({
          name: "knowledge-asset-publish",
          arguments: assetWithContent,
        });

        expect(result.content).to.be.an("array");
        expect(result.content).to.have.length.greaterThan(0);
      }
    });

    it("should handle empty asset content gracefully", async () => {
      const emptyAsset = createTestAsset({ 
        content: {
          "@context": "https://schema.org",
          "@type": "Thing"
        }
      });

      const result = await mockMcpClient.callTool({
        name: "knowledge-asset-publish",
        arguments: emptyAsset,
      });

      expect(result.content).to.be.an("array");
      expect(result.content).to.have.length.greaterThan(0);
    });

    it("should process numeric asset IDs correctly", async () => {
      const assetWithNumericId = createTestAsset({
        metadata: {
          source: "numeric-test",
          sourceId: "123456789"
        }
      });

      const result = await mockMcpClient.callTool({
        name: "knowledge-asset-publish",
        arguments: assetWithNumericId,
      });

      expect(result.content).to.be.an("array");
      expect(result.content).to.have.length.greaterThan(0);
    });
  });

  describe("Plugin Architecture and Integration", () => {
    it("should register all required API routes", async () => {
      const routes = [
        "/api/dkg/metrics/queue",
        "/api/dkg/metrics/wallets", 
        "/admin/queues"
      ];

      for (const route of routes) {
        const response = await request(app).get(route);
        expect(response.status).to.not.equal(404);
      }
    });

    it("should handle plugin initialization without crashing", async () => {
      expect(app).to.not.equal(undefined);
      expect(apiRouter).to.not.equal(undefined);
      
      const response = await request(app).get("/api/dkg/metrics/queue");
      expect(response.status).to.equal(503);
    });

    it("should maintain consistent response format across endpoints", async () => {
      const endpoints = [
        "/api/dkg/metrics/queue",
        "/api/dkg/metrics/wallets"
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expect(response.status).to.equal(503);
        expect(response.body).to.have.property("error");
        expect(response.body.error).to.be.a("string");
        expect(response.body.error.length).to.be.greaterThan(0);
      }
    });
  });
});
