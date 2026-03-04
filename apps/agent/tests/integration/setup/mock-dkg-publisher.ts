import { DkgPlugin } from "@dkg/plugins";
import { z } from "@dkg/plugin-swagger";

/**
 * Mock DKG Publisher Plugin for API contract testing
 * This provides the same MCP tools and API routes as the real plugin but without database dependencies
 * Used for testing plugin registration, API contracts, and input validation
 */
export const mockDkgPublisherPlugin: DkgPlugin = (ctx, mcp, api) => {
  console.log("🔧 Mock DKG Publisher Plugin loaded for API contract testing");

  // Register the same MCP tool as the real plugin
  mcp.registerTool(
    "knowledge-asset-publish",
    {
      title: "Publish Knowledge Asset",
      description: "Register a JSON-LD asset for publishing to the DKG",
      inputSchema: {
        content: z.object({}).passthrough(),
        metadata: z
          .object({
            source: z.string().optional(),
            sourceId: z.string().optional(),
          })
          .optional(),
        privacy: z.enum(["private", "public"]).optional(),
      },
    },
    async (input) => {
      // Mock the publishing process
      const assetId = `mock-asset-${Date.now()}`;
      const mockUal = `did:dkg:otp:20430/0x${Math.random().toString(16).substr(2, 8)}/${assetId}`;

      return {
        content: [
          {
            type: "text",
            text:
              `✅ Mock Knowledge Asset published successfully!\n\n` +
              `📊 Asset ID: ${assetId}\n` +
              `🔗 UAL: ${mockUal}\n` +
              `📝 Source: ${input.metadata?.source || "test-source"}\n` +
              `🏷️  Source ID: ${input.metadata?.sourceId || "test-id"}\n` +
              `🔒 Privacy: ${input.privacy || "public"}\n\n` +
              `This is a mock response for integration testing. In a real scenario, ` +
              `the asset would be queued for processing and published to the DKG network.`,
          },
        ],
      };
    },
  );

  // Register API routes (mock versions)
  api.get("/api/dkg/metrics/queue", (req, res) => {
    res.status(503).json({
      error: "Services not initialized",
    });
  });

  api.get("/api/dkg/metrics/wallets", (req, res) => {
    res.status(503).json({
      error: "Services not initialized",
    });
  });

  api.get("/admin/queues", (req, res) => {
    res.status(503).json({
      error: "DKG Publisher Plugin is starting up",
    });
  });
};
