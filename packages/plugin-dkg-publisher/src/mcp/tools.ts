import { z } from "@dkg/plugin-swagger";
import type { ServiceContainer, AssetService } from "../services";
import type { Database } from "../database";
import { assets } from "../database/schema";
import { eq } from "drizzle-orm";
import { formatAssetStatus } from "./utils";

/**
 * Register all MCP tools for the DKG Publisher Plugin
 */
export function registerMcpTools(mcp: any, serviceContainer: ServiceContainer | null) {
  // MCP tool for creating knowledge assets
  mcp.registerTool(
    "knowledge-asset-publish",
    {
      title: "Publish Knowledge Asset",
      description: "Register a JSON-LD asset for publishing to the DKG. Use the MCP query tools to check status and view recent published assets.",
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
    async (input: any, req: any) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      const assetService = serviceContainer.get<AssetService>("assetService");

      const assetInput = {
        content: input.content,
        metadata: input.metadata,
        publishOptions: {
          privacy: input.privacy || "private",
        },
      };

      const result = await assetService.registerAsset(assetInput);
      // Asset registration emits 'asset-queued' event which triggers queue addition

      // Extract content @id for user reference
      let contentId = "Unknown";
      try {
        if (input.content?.["@id"]) {
          contentId = input.content["@id"] as string;
        }
      } catch (e) {
        console.warn("⚠️ Failed to extract @id from content:", e);
      }

      return {
        content: [
          {
            type: "text",
            text: `Asset registered for publishing (ID: ${result.id}, Status: ${result.status})\n\n` +
                 `Content ID: ${contentId}\n\n` +
                 `To check the publishing status later, ask:\n` +
                 `• "What's the status of asset '${contentId}'?"\n` +
                 `• "Show me my recent published assets"\n` +
                 `• "Show me my published assets"`,
          },
        ],
      };
    },
  );

  // MCP tool for querying asset status by content ID
  mcp.registerTool(
    "knowledge-asset-status-by-content-id",
    {
      title: "Get Knowledge Asset Information by Content ID",
      description: "Check, lookup, show, or query a knowledge asset by its JSON-LD @id (URN). Use this when the user provides a URN like 'urn:test:asset:...' or asks about a specific asset ID. Returns status, UAL, transaction hash, and publishing details.",
      inputSchema: {
        contentId: z.string().describe("The @id from the JSON-LD content (e.g., 'urn:test:asset:manual-test-1')"),
      },
    },
    async (input: any, req: any) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      const assetService = serviceContainer.get<AssetService>("assetService");

      const asset = await assetService.getAssetByContentId(input.contentId);

      if (!asset) {
        return {
          content: [
            {
              type: "text",
              text: `No asset found with content ID: ${input.contentId}\n\n` +
                   `Make sure you're using the exact @id from your published content.`,
            },
          ],
        };
      }

      const statusText = formatAssetStatus({
        asset,
        contentId: input.contentId,
        includeHeader: true,
      });

      return {
        content: [
          {
            type: "text",
            text: statusText,
          },
        ],
      };
    },
  );

  // MCP tool for listing recent assets
  mcp.registerTool(
    "knowledge-asset-list-recent",
    {
      title: "List Recent Knowledge Assets",
      description: "Show, list, or display recent knowledge assets. Use when user asks 'show me recent assets', 'what was published', 'last X assets', etc. Can filter by status (published, failed, publishing, queued). Always returns up to 20 most recent assets (capped at 20).",
      inputSchema: {
        limit: z.number().min(1).max(20).default(5).optional().describe("Number of assets to return (1-20, default: 5)"),
        status: z.enum(["published", "failed", "publishing", "queued"]).optional().describe("Filter by status (optional)"),
      },
    },
    async (input: any, req: any) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      const assetService = serviceContainer.get<AssetService>("assetService");
      const assetsList = await assetService.getRecentAssets(
        input.limit || 5,
        input.status,
      );

      if (assetsList.length === 0) {
        const statusFilter = input.status ? ` with status '${input.status}'` : '';
        return {
          content: [
            {
              type: "text",
              text: `No assets found${statusFilter}.\n\nNo knowledge assets have been published yet.`,
            },
          ],
        };
      }

      const requestedLimit = input.limit || 5;
      const statusFilter = input.status ? ` ${input.status}` : '';
      let resultText = `**Last ${assetsList.length}${statusFilter} Assets** (showing most recent, max ${requestedLimit})\n\n`;
      
      const db = serviceContainer.get<Database>("db");
      
      // Fetch content IDs for each asset
      for (let idx = 0; idx < assetsList.length; idx++) {
        const asset = assetsList[idx];
        
        // Try to extract Content ID from stored content
        let contentId = "Unknown";
        try {
          const [dbAsset] = await db
            .select()
            .from(assets)
            .where(eq(assets.id, asset.id))
            .limit(1);
          
          if (dbAsset?.contentUrl) {
            const response = await fetch(dbAsset.contentUrl).catch(() => null);
            if (response?.ok) {
              const content = await response.json();
              const actualContent = content.private || content.public || content;
              if (actualContent?.["@id"]) {
                contentId = actualContent["@id"] as string;
              }
            }
          }
        } catch (e) {
          // Keep as "Unknown"
        }
        
        resultText += formatAssetStatus({
          asset,
          contentId,
          numbered: true,
          index: idx + 1,
        });
        resultText += `\n`;
      }

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    },
  );

  // MCP tool for querying assets by status
  mcp.registerTool(
    "knowledge-asset-query-by-status",
    {
      title: "Find Knowledge Assets by Status",
      description: "Find, show, list, or query knowledge assets by publishing status. Use when user asks 'show me all published', 'failed assets', 'what's publishing', etc. Supports statuses: published (successfully published), failed (publishing failed), publishing (currently being published), queued (waiting to publish). Always returns up to 20 most recent assets matching the status (capped at 20).",
      inputSchema: {
        status: z.enum(["published", "failed", "publishing", "queued"]).describe("The status to filter by"),
        limit: z.number().min(1).max(20).default(10).optional().describe("Maximum number of results (1-20, default: 10)"),
      },
    },
    async (input: any, req: any) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      const assetService = serviceContainer.get<AssetService>("assetService");
      const assetsList = await assetService.getAssetsByStatusForDisplay(
        input.status,
        input.limit || 10,
      );

      if (assetsList.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No assets found with status: ${input.status}\n\n` +
                   `No ${input.status} knowledge assets found.`,
            },
          ],
        };
      }

      const requestedLimit = input.limit || 10;
      let resultText = `**Last ${assetsList.length} ${input.status.toUpperCase()} Assets** (showing most recent, max ${requestedLimit})\n\n`;
      
      const db = serviceContainer.get<Database>("db");
      
      // Fetch content IDs for each asset
      for (let idx = 0; idx < assetsList.length; idx++) {
        const asset = assetsList[idx];
        
        // Try to extract Content ID from stored content
        let contentId = "Unknown";
        try {
          const [dbAsset] = await db
            .select()
            .from(assets)
            .where(eq(assets.id, asset.id))
            .limit(1);
          
          if (dbAsset?.contentUrl) {
            const response = await fetch(dbAsset.contentUrl).catch(() => null);
            if (response?.ok) {
              const content = await response.json();
              const actualContent = content.private || content.public || content;
              if (actualContent?.["@id"]) {
                contentId = actualContent["@id"] as string;
              }
            }
          }
        } catch (e) {
          // Keep as "Unknown"
        }
        
        resultText += formatAssetStatus({
          asset,
          contentId,
          numbered: true,
          index: idx + 1,
        });
        
        // Additional details for this view
        if (asset.transactionHash) {
          resultText += `   TX: ${asset.transactionHash}\n`;
        }
        
        if (asset.lastError && input.status === "failed") {
          resultText += `   Attempts: ${asset.attemptCount}\n`;
        }
        
        resultText += `\n`;
      }

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    },
  );
}
