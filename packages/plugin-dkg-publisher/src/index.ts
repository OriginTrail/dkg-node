import { defineDkgPlugin } from "@dkg/plugins";
import { z } from "@dkg/plugin-swagger";
import type { KnowledgeAssetManagerConfig, AssetInput } from "./types";
import { config as dotenvConfig } from "dotenv";
import path from "path";
import {
  initializeServices,
  shutdownServices,
  ServiceContainer,
  AssetService,
  WalletService,
  QueueService,
  DkgService,
} from "./services";
import { openAPIRoute } from "@dkg/plugin-swagger";
import { assets } from "./database/schema";
import { Database } from "./database";
import { eq } from "drizzle-orm";

import express from "express";

/**
 * DKG Publisher Plugin
 *
 * Enterprise-grade system for publishing JSON-LD assets to DKG network
 * Features:
 * - Event-driven 2-tier queue architecture (DB + BullMQ)
 * - Atomic wallet management with locking
 * - Crash recovery and timeout handling
 * - Real-time monitoring and health checks
 */

// Services container for managing dependencies
let serviceContainer: ServiceContainer | null = null;

// No intervals needed anymore

/**
 * Helper function to format asset status information
 */
interface FormatAssetStatusOptions {
  asset: any;
  contentId?: string;
  includeHeader?: boolean;
  numbered?: boolean;
  index?: number;
}

function formatAssetStatus(options: FormatAssetStatusOptions): string {
  const { asset, contentId, includeHeader = false, numbered = false, index } = options;
  let text = "";

  if (includeHeader) {
    text += `**Asset Status**: ${asset.status.toUpperCase()}\n\n`;
  }

  if (numbered && index !== undefined) {
    text += `**${index}. Asset ID ${asset.id}**\n`;
  } else {
    text += `**Asset ID**: ${asset.id}\n`;
  }

  if (contentId) {
    text += numbered ? `   Content ID: ${contentId}\n` : `**Content ID**: ${contentId}\n`;
  }

  if (!includeHeader && !numbered) {
    // For single asset status view
    if (asset.ual) {
      text += `\n**Published!**\n`;
      text += `**UAL**: ${asset.ual}\n`;
      if (asset.transactionHash) {
        text += `**Transaction**: ${asset.transactionHash}\n`;
      }
      if (asset.publishedAt) {
        text += `**Published At**: ${asset.publishedAt}\n`;
      }
    } else if (asset.status === "failed") {
      text += `\n**Publishing Failed**\n`;
      if (asset.lastError) {
        text += `**Error**: ${asset.lastError}\n`;
      }
      text += `**Attempts**: ${asset.attemptCount}\n`;
    } else if (asset.status === "publishing") {
      text += `\n**Currently Publishing...**\n`;
      text += `Please check again in a moment.\n`;
    } else {
      text += `\n**Status**: ${asset.status.toUpperCase()}\n`;
    }
  } else {
    // For list views
    if (!numbered) {
      text += `   Status: ${asset.status.toUpperCase()}\n`;
    } else {
      text += `   Status: ${asset.status.toUpperCase()}\n`;
    }

    if (asset.ual) {
      text += numbered ? `   UAL: ${asset.ual}\n` : `**UAL**: ${asset.ual}\n`;
    }

    if (asset.lastError && asset.status === "failed") {
      text += numbered
        ? `   Error: ${asset.lastError.substring(0, 100)}...\n`
        : `**Error**: ${asset.lastError}\n`;
    }

    if (asset.publishedAt) {
      text += numbered ? `   Published: ${asset.publishedAt}\n` : `**Published**: ${asset.publishedAt}\n`;
    }
  }

  return text;
}

// Plugin definition for DKG integration
export default defineDkgPlugin((_ctx, mcp, api) => {
  const pluginInitTime = Date.now();
  console.log(
    `🔍 DKG Publisher Plugin executing at ${new Date().toISOString()} (${pluginInitTime})`,
  );
  // Load configuration from package root .env file
  const envPath = path.resolve(__dirname, "..", ".env.publisher");

  console.log(`🔧 Loading DKG Publisher config from: ${envPath}`);
  dotenvConfig({ path: envPath });

  console.log(`📊 DKGP_DATABASE_URL found: ${!!process.env.DKGP_DATABASE_URL}`);

  // Initialize services if configuration is provided via environment
  if (process.env.DKGP_DATABASE_URL) {
    const config: KnowledgeAssetManagerConfig = {
      database: {
        connectionString: process.env.DKGP_DATABASE_URL,
      },
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
        password: process.env.REDIS_PASSWORD,
      },
      wallets: [], // Should be loaded from config or setup
      dkg: {
        endpoint: process.env.DKG_ENDPOINT,
        blockchain: process.env.DKG_BLOCKCHAIN,
      },
      encryptionKey: process.env.ENCRYPTION_KEY,
    };
    console.log(`🚀 Initializing DKG Publisher services... (${Date.now()})`);

    // Mount storage directory immediately (before services initialize)
    const storageType = process.env.STORAGE_TYPE || "filesystem";
    const storagePath =
      process.env.STORAGE_PATH || path.resolve(__dirname, "../storage");

    if (storageType === "filesystem") {
      try {
        const resolvedStoragePath = path.resolve(storagePath);
        console.log(
          `📁 Mounting storage serving at /storage from: ${resolvedStoragePath}`,
        );
        (api as any).use("/storage", express.static(resolvedStoragePath));
        console.log(`✅ Storage serving enabled at /storage`);
      } catch (staticError) {
        console.error("❌ Static file serving setup failed:", staticError);
      }
    }

    // Initialize services
    initializeServices(config)
      .then((container) => {
        serviceContainer = container;

        console.log(`✅ DKG Publisher Plugin ready!`);
        console.log(
          `   - Database: ${config.database.connectionString.replace(/\/\/.*@/, "//***@")}`,
        );
        console.log(`   - Redis: ${config.redis.host}:${config.redis.port}`);
        console.log(`   - DKG Endpoint: ${config.dkg?.endpoint}`);
        console.log(`   - Blockchain: ${config.dkg?.blockchain}`);
        console.log(`📁 Storage configured for: ${storageType}`);
      })
      .catch((error) => {
        console.error("❌ DKG Publisher Plugin initialization failed:", error);
      });
  } else {
    console.log(
      "⚠️  DKG Publisher Plugin not configured - DKGP_DATABASE_URL not found",
    );
    console.log(`   Looked for config in: ${envPath}`);
  }

  // Mount admin dashboard route immediately - handle service readiness internally
  api.use("/admin/queues", (req, res, next) => {
    if (!serviceContainer) {
      return res
        .status(503)
        .json({ error: "DKG Publisher Plugin is starting up" });
    }

    try {
      const queueService = serviceContainer.get<QueueService>("queueService");
      const dashboard = queueService.getDashboard();
      // Forward request to Bull Board dashboard
      dashboard(req, res, next);
    } catch (error) {
      console.error("❌ Dashboard access failed:", error);
      res.status(500).json({ error: "Dashboard temporarily unavailable" });
    }
  });

  console.log(`📊 Admin dashboard route registered at /admin/queues`);

  // Register API routes using the plugin's native method
  api.post(
    "/api/dkg/assets",
    openAPIRoute(
      {
        tag: "Knowledge Assets",
        summary: "Register asset for publishing",
        description: "Register a JSON-LD asset for publishing to the DKG",
        body: z.object({
          content: z.union([z.object({}).passthrough(), z.string()]),
          metadata: z
            .object({
              source: z.string().optional(),
              sourceId: z.string().optional(),
            })
            .passthrough()
            .optional(),
          publishOptions: z
            .object({
              privacy: z.enum(["private", "public"]).optional(),
              priority: z.number().min(1).max(100).optional(),
              epochs: z.number().optional(),
              maxAttempts: z.number().optional(),
            })
            .optional(),
        }),
        response: {
          schema: z.object({
            id: z.number(),
            status: z.string(),
            attemptCount: z.number(),
          }),
        },
      },
      async (req, res) => {
        if (!serviceContainer) {
          return res
            .status(503)
            .json({ error: "DKG Publisher Plugin is starting up" });
        }

        try {
          console.log("🔄 Processing asset registration request...");

          const assetService =
            serviceContainer.get<AssetService>("assetService");

          const result = await assetService.registerAsset(
            req.body as AssetInput,
          );
          // Asset registration emits 'asset-queued' event which triggers queue addition

          console.log("✅ Asset registered with ID:", result.id);
          res.json(result);
        } catch (error: any) {
          console.error("❌ Asset registration failed:", error);
          res.status(500).json({ error: error.message });
        }
      },
    ),
  );

  api.get(
    "/api/dkg/assets/status/:id",
    openAPIRoute(
      {
        tag: "Knowledge Assets",
        summary: "Get asset status",
        params: z.object({
          id: z.string().transform(Number),
        }),
      },
      async (req, res) => {
        if (!serviceContainer) {
          return res
            .status(503)
            .json({ error: "DKG Publisher Plugin is starting up" });
        }

        try {
          const assetService =
            serviceContainer.get<AssetService>("assetService");
          const asset = await assetService.getAsset(req.params.id);

          if (!asset) {
            return res.status(404).json({ error: "Asset not found" });
          }

          res.json(asset);
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      },
    ),
  );

  // Add metrics endpoints
  api.get("/api/dkg/metrics/queue", async (_req, res) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const queueService = serviceContainer.get<QueueService>("queueService");
      const assetService = serviceContainer.get<AssetService>("assetService");
      const walletService = serviceContainer.get<WalletService>("walletService");

      // Get Redis queue stats
      const queueStats = await queueService.getQueueStats();

      // Get database asset counts by status
      const dbCounts = await assetService.getAssetCountsByStatus();

      // Get wallet stats to calculate available slots
      const walletStats = await walletService.getWalletStats();
      const activeJobs = queueStats.waiting + queueStats.active;
      const availableSlots = Math.max(0, walletStats.total - activeJobs);

      res.json({
        redis: {
          activeJobs: queueStats.active,
          waitingJobs: queueStats.waiting,
          delayedJobs: queueStats.delayed,
        },
        database: {
          publishing: dbCounts.publishing, // Assets with status 'publishing'
          published: dbCounts.published,   // Assets with status 'published' (total completed)
          failed: dbCounts.failed,         // Assets with status 'failed' (retryCount >= maxAttempts)
        },
        capacity: {
          totalWallets: walletStats.total,
          availableWallets: walletStats.available,
          lockedWallets: walletStats.inUse,
          availableSlots: availableSlots, // Slots available for new jobs
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  api.get("/api/dkg/metrics/wallets", async (_req, res) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const walletService = serviceContainer.get<WalletService>("walletService");
      const stats = await walletService.getWalletStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add SPARQL query endpoint
  api.post(
    "/api/dkg/query",
    openAPIRoute(
      {
        tag: "DKG Queries",
        summary: "Execute SPARQL Query",
        description: "Execute a SPARQL query on the DKG network",
        body: z.object({
          query: z.string().min(1, "Query cannot be empty"),
          queryType: z
            .enum(["SELECT", "CONSTRUCT", "ASK", "DESCRIBE"])
            .optional()
            .default("SELECT"),
          validate: z.boolean().optional().default(true),
        }),
        response: {
          schema: z.object({
            success: z.boolean(),
            data: z.any().optional(),
            error: z.string().optional(),
            validation: z
              .object({
                valid: z.boolean(),
                error: z.string().optional(),
              })
              .optional(),
          }),
        },
      },
      async (req, res) => {
        if (!serviceContainer) {
          return res.status(503).json({
            success: false,
            error: "DKG service is starting up",
          });
        }

        try {
          const { query, queryType = "SELECT" } = req.body;
          const dkgService = serviceContainer.get<DkgService>("dkgService");

          // Execute SPARQL query
          const result = await dkgService.executeSparqlQuery(query, queryType);

          res.json(result);
        } catch (error: any) {
          res.status(500).json({
            success: false,
            error: error.message,
          });
        }
      },
    ),
  );

  // Add DKG asset get endpoint
  api.get(
    "/api/dkg/assets",
    openAPIRoute(
      {
        tag: "DKG Queries",
        summary: "Get DKG Asset",
        description: "Retrieve an asset from DKG by UAL",
        query: z.object({
          ual: z.string(),
        }),
        response: {
          schema: z.object({
            success: z.boolean(),
            data: z.any().optional(),
            error: z.string().optional(),
          }),
        },
      },
      async (req, res) => {
        if (!serviceContainer) {
          return res.status(503).json({
            success: false,
            error: "DKG service is starting up",
          });
        }

        try {
          const { ual } = req.query;
          const dkgService = serviceContainer.get<DkgService>("dkgService");

          const result = await dkgService.getAsset(ual);

          res.json(result);
        } catch (error: any) {
          res.status(500).json({
            success: false,
            error: error.message,
          });
        }
      },
    ),
  );

  // MCP tool for creating knowledge assets
  mcp.registerTool(
    "knowledge-asset-publish",
    {
      title: "Publish Knowledge Asset",
      description: "Register a JSON-LD asset for publishing to the DKG. The asset will be tracked per-user so you can query your published assets later.",
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
    async (input, req) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      // Extract userId from authenticated request
      const userId = req?.authInfo?.extra?.userId as string | undefined;

      const assetService = serviceContainer.get<AssetService>("assetService");

      const assetInput = {
        content: input.content,
        metadata: input.metadata,
        publishOptions: {
          privacy: input.privacy || "private",
        },
      };

      const result = await assetService.registerAsset(assetInput, userId);
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
      description: "Check, lookup, show, or query a knowledge asset by its JSON-LD @id (URN). Use this when the user provides a URN like 'urn:test:asset:...' or asks about a specific asset ID. Returns status, UAL, transaction hash, and publishing details. Only shows assets created by the current user.",
      inputSchema: {
        contentId: z.string().describe("The @id from the JSON-LD content (e.g., 'urn:test:asset:manual-test-1')"),
      },
    },
    async (input, req) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      const userId = req?.authInfo?.extra?.userId as string | undefined;
      const assetService = serviceContainer.get<AssetService>("assetService");

      const asset = await assetService.getAssetByContentId(input.contentId, userId);

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
      description: "Show, list, or display recent knowledge assets created by the user. Use when user asks 'show me my recent assets', 'what did I publish', 'my last X assets', etc. Can filter by status (published, failed, publishing, queued). Returns up to 20 most recent assets.",
      inputSchema: {
        limit: z.number().min(1).max(20).default(5).optional().describe("Number of assets to return (1-20, default: 5)"),
        status: z.enum(["published", "failed", "publishing", "queued"]).optional().describe("Filter by status (optional)"),
      },
    },
    async (input, req) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      const userId = req?.authInfo?.extra?.userId as string | undefined;
      
      if (!userId) {
        return {
          content: [
            {
              type: "text",
              text: "Unable to identify user. Please ensure you're logged in.",
            },
          ],
        };
      }

      const assetService = serviceContainer.get<AssetService>("assetService");
      const assetsList = await assetService.getRecentAssetsByUser(
        userId,
        input.limit || 5,
        input.status,
      );

      if (assetsList.length === 0) {
        const statusFilter = input.status ? ` with status '${input.status}'` : '';
        return {
          content: [
            {
              type: "text",
              text: `No assets found${statusFilter}.\n\nYou haven't published any knowledge assets yet.`,
            },
          ],
        };
      }

      const requestedLimit = input.limit || 5;
      const statusFilter = input.status ? ` ${input.status}` : '';
      let resultText = `**Your Last ${assetsList.length}${statusFilter} Assets** (showing most recent, max ${requestedLimit})\n\n`;
      
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
      description: "Find, show, list, or query knowledge assets by publishing status. Use when user asks 'show me all published', 'my failed assets', 'what's publishing', etc. Supports statuses: published (successfully published), failed (publishing failed), publishing (currently being published), queued (waiting to publish). Returns up to 20 most recent assets matching the status.",
      inputSchema: {
        status: z.enum(["published", "failed", "publishing", "queued"]).describe("The status to filter by"),
        limit: z.number().min(1).max(20).default(10).optional().describe("Maximum number of results (1-20, default: 10)"),
      },
    },
    async (input, req) => {
      if (!serviceContainer) {
        throw new Error("DKG Publisher Plugin not configured");
      }

      const userId = req?.authInfo?.extra?.userId as string | undefined;
      
      if (!userId) {
        return {
          content: [
            {
              type: "text",
              text: "Unable to identify user. Please ensure you're logged in.",
            },
          ],
        };
      }

      const assetService = serviceContainer.get<AssetService>("assetService");
      const assetsList = await assetService.getAssetsByStatusForUser(
        userId,
        input.status,
        input.limit || 10,
      );

      if (assetsList.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No assets found with status: ${input.status}\n\n` +
                   `You don't have any ${input.status} knowledge assets.`,
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
});

// Cleanup function
const gracefulShutdown = async (signal: string) => {
  console.log(`🔄 Received ${signal}, shutting down services...`);

  // No intervals to clear anymore

  if (serviceContainer) {
    await shutdownServices(serviceContainer);
    console.log("✅ Services shut down gracefully");
  }

  // Reset initialization state
  serviceContainer = null;

  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Export types
export type {
  AssetInput,
  AssetStatus,
  KnowledgeAssetManagerConfig,
} from "./types";
