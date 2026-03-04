import { defineDkgPlugin } from "@dkg/plugins";
import { z } from "@dkg/plugin-swagger";
import type { KnowledgeAssetManagerConfig, AssetInput } from "./types";
import path from "path";
import {
  initializeServices,
  shutdownServices,
  ServiceContainer,
  AssetService,
  WalletService,
  QueueService,
} from "./services";
import { openAPIRoute } from "@dkg/plugin-swagger";
import express from "express";
import { registerMcpTools } from "./mcp/tools";
import {
  applyPublisherRuntimeDefaults,
  resolvePublisherRuntimeConfig,
} from "./config";

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

// Plugin definition for DKG integration
export default defineDkgPlugin((ctx, mcp, api) => {
  const pluginInitTime = Date.now();
  console.log(
    `🔍 DKG Publisher Plugin executing at ${new Date().toISOString()} (${pluginInitTime})`,
  );
  const resolution = resolvePublisherRuntimeConfig();
  console.log(`📊 DKGP_DATABASE_URL found: ${Boolean(resolution)}`);

  if (resolution) {
    const config: KnowledgeAssetManagerConfig = resolution.config;
    applyPublisherRuntimeDefaults(resolution);
    console.log(`🚀 Initializing DKG Publisher services... (${Date.now()})`);

    // Mount storage directory immediately (before services initialize)
    const { storageType, storagePath } = resolution.runtime;

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
        if (resolution.loadedLegacyEnv) {
          console.log(
            `   - Legacy env imported from: ${resolution.legacyEnvPath}`,
          );
        }
      })
      .catch((error) => {
        console.error("❌ DKG Publisher Plugin initialization failed:", error);
      });
  } else {
    console.log(
      "⚠️  DKG Publisher Plugin not configured - DKGP_DATABASE_URL not found",
    );
    console.log(
      `   Looked for config in: ${path.resolve(__dirname, "..", ".env.publisher")}`,
    );
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
        finalizeRouteConfig: (config) => ({
          ...config,
          security: [],
        }),
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
        finalizeRouteConfig: (config) => ({
          ...config,
          security: [],
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

  // Register all MCP tools for publisher plugin
  registerMcpTools(mcp, serviceContainer, ctx);
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
export {
  applyPublisherRuntimeDefaults,
  resolvePublisherRuntimeConfig,
} from "./config";
export { provisionPublisherDatabase } from "./provision";
