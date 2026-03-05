import consumers from "stream/consumers";
import { z } from "@dkg/plugin-swagger";
import type { ServiceContainer, AssetService } from "../services";
import type { Database } from "../database";
import { assets } from "../database/schema";
import { eq } from "drizzle-orm";
import { formatAssetStatus } from "./utils";
import type { DkgContext } from "@dkg/plugins";

/**
 * Register all MCP tools for the DKG Publisher Plugin
 */
export function registerMcpTools(
  mcp: any,
  serviceContainer: ServiceContainer | null,
  ctx: DkgContext,
) {
  // MCP tool for creating knowledge assets
  mcp.registerTool(
    "knowledge-asset-publish",
    {
      title: "Publish Knowledge Asset",
      description:
        "Register a JSON-LD asset for publishing to the DKG through the DKG Publisher plugin async queue. " +
        "This tool queues publishing and returns a tracking record, not an immediate final UAL result. " +
        "For direct synchronous publishing with immediate UAL output, use the Essentials `dkg-create` tool. " +
        "You can provide content directly as a JSON object, or provide a blobId to load content from a previously uploaded file.",
      inputSchema: {
        content: z
          .object({})
          .passthrough()
          .optional()
          .describe(
            "JSON-LD content object to publish (optional if blobId is provided)",
          ),
        blobId: z
          .string()
          .optional()
          .describe(
            "ID of an uploaded blob to publish (from the upload tool). Use this for large files instead of content.",
          ),
        metadata: z
          .object({
            source: z.string().optional(),
            sourceId: z.string().optional(),
          })
          .optional(),
        publishOptions: z
          .object({
            privacy: z.enum(["private", "public"]).optional(),
            priority: z.number().min(1).max(100).optional(),
            epochs: z.number().optional(),
            maxAttempts: z.number().optional(),
          })
          .optional()
          .describe("Optional async publishing controls."),
      },
    },
    async (input: any, req: any) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      // Validate that at least one of content or blobId is provided
      if (!input.content && !input.blobId) {
        throw new Error(
          "Either 'content' or 'blobId' must be provided to publish an asset",
        );
      }

      // If both are provided, prefer blobId (more efficient for large files)
      let content: any;
      let contentSource: string;

      if (input.blobId) {
        try {
          const blob = await ctx.blob.get(input.blobId);
          if (!blob) {
            throw new Error(`Blob not found: ${input.blobId}`);
          }

          // Read blob content as text and parse as JSON
          const text = await consumers.text(blob.data);
          content = JSON.parse(text);
          contentSource = `blob:${input.blobId}`;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("not found")) {
            throw error;
          }
          throw new Error(
            `Failed to read blob ${input.blobId}: ${errorMessage}. Ensure the blob contains valid JSON-LD.`,
          );
        }
      } else {
        // Use provided content directly
        content = input.content;
        contentSource = "direct";
      }

      const assetService = serviceContainer.get<AssetService>("assetService");
      const resolvedPrivacy = input.publishOptions?.privacy ?? "private";
      const resolvedPriority = input.publishOptions?.priority;
      const resolvedEpochs = input.publishOptions?.epochs;
      const resolvedMaxAttempts = input.publishOptions?.maxAttempts;

      const assetInput = {
        content,
        metadata: input.metadata,
        publishOptions: {
          privacy: resolvedPrivacy,
          ...(typeof resolvedPriority === "number"
            ? { priority: resolvedPriority }
            : {}),
          ...(typeof resolvedEpochs === "number"
            ? { epochs: resolvedEpochs }
            : {}),
          ...(typeof resolvedMaxAttempts === "number"
            ? { maxAttempts: resolvedMaxAttempts }
            : {}),
        },
      };

      const result = await assetService.registerAsset(assetInput);
      // Asset registration emits 'asset-queued' event which triggers queue addition

      // Extract content @id for user reference
      let contentId = "Unknown";
      try {
        if (content?.["@id"]) {
          contentId = content["@id"] as string;
        }
      } catch (e) {
        console.warn("⚠️ Failed to extract @id from content:", e);
      }

      const sourceInfo =
        contentSource === "direct"
          ? "Content provided directly"
          : `Content loaded from ${contentSource}`;

      return {
        content: [
          {
            type: "text",
            text:
              `Asset registered for publishing (ID: ${result.id}, Status: ${result.status})\n\n` +
              `Content ID: ${contentId}\n` +
              `Source: ${sourceInfo}\n\n` +
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
      description:
        "Check async publishing status for a specific JSON-LD @id (URN) that was submitted through the DKG Publisher plugin queue. " +
        "Returns tracked Publisher status details (status, UAL if published, transaction hash, attempts, and errors).",
      inputSchema: {
        contentId: z
          .string()
          .describe(
            "The @id from the JSON-LD content (e.g., 'urn:test:asset:manual-test-1')",
          ),
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
      description:
        "List recent async publishing records tracked by the DKG Publisher plugin. " +
        "Use this for queue/history views (optionally filtered by status) with pagination support.",
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .default(20)
          .optional()
          .describe("Number of assets to return (default: 20)"),
        offset: z
          .number()
          .min(0)
          .default(0)
          .optional()
          .describe("Number of assets to skip (for pagination, default: 0)"),
        status: z
          .enum(["published", "failed", "publishing", "queued"])
          .optional()
          .describe("Filter by status (optional)"),
      },
    },
    async (input: any, req: any) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      const assetService = serviceContainer.get<AssetService>("assetService");
      
      const assetsList = await assetService.getRecentAssets(
        input.limit,
        input.status,
        input.offset,
      );

      if (assetsList.length === 0) {
        const statusFilter = input.status ? ` with status '${input.status}'` : '';
        const rangeText = input.offset > 0 ? ` (range ${input.offset + 1}-${input.offset + input.limit})` : '';
        return {
          content: [
            {
              type: "text",
              text: `No assets found${statusFilter}${rangeText}.\n\nNo knowledge assets in this range.`,
            },
          ],
        };
      }

      const statusFilter = input.status ? ` ${input.status}` : '';
      const rangeStart = input.offset + 1;
      const rangeEnd = input.offset + assetsList.length;
      const rangeText = input.offset > 0 ? ` (${rangeStart}-${rangeEnd})` : '';
      let resultText = `**${assetsList.length}${statusFilter} Assets${rangeText}**\n\n`;
      
      const db = serviceContainer.get<Database>("db");
      
      // Fetch content IDs for each asset
      for (let idx = 0; idx < assetsList.length; idx++) {
        const asset = assetsList[idx];
        
        // Attempt to extract Content ID (@id) from the stored JSON-LD content file
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
          console.warn(`Failed to extract Content ID for asset ${asset.id}:`, e instanceof Error ? e.message : String(e));
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
      description:
        "Query async publishing records in the DKG Publisher plugin by a required status. " +
        "Use this for focused queue/operations views (published, failed, publishing, queued) with pagination.",
      inputSchema: {
        status: z
          .enum(["published", "failed", "publishing", "queued"])
          .describe("The status to filter by"),
        limit: z
          .number()
          .min(1)
          .default(20)
          .optional()
          .describe("Maximum number of results (default: 20)"),
        offset: z
          .number()
          .min(0)
          .default(0)
          .optional()
          .describe("Number of assets to skip (for pagination, default: 0)"),
      },
    },
    async (input: any, req: any) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      const assetService = serviceContainer.get<AssetService>("assetService");
      
      const assetsList = await assetService.getAssetsByStatusForDisplay(
        input.status,
        input.limit,
        input.offset,
      );

      if (assetsList.length === 0) {
        const rangeText = input.offset > 0 ? ` (range ${input.offset + 1}-${input.offset + input.limit})` : '';
        return {
          content: [
            {
              type: "text",
              text: `No assets found with status: ${input.status}${rangeText}\n\n` +
                   `No ${input.status} knowledge assets in this range.`,
            },
          ],
        };
      }

      const rangeStart = input.offset + 1;
      const rangeEnd = input.offset + assetsList.length;
      const rangeText = input.offset > 0 ? ` (${rangeStart}-${rangeEnd})` : '';
      let resultText = `**${assetsList.length} ${input.status.toUpperCase()} Assets${rangeText}**\n\n`;
      
      const db = serviceContainer.get<Database>("db");
      
      // Fetch content IDs for each asset
      for (let idx = 0; idx < assetsList.length; idx++) {
        const asset = assetsList[idx];
        
        // Attempt to extract Content ID (@id) from the stored JSON-LD content file
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
          console.warn(`Failed to extract Content ID for asset ${asset.id}:`, e instanceof Error ? e.message : String(e));
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
