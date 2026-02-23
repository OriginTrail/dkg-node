import IORedis from "ioredis";
import { Database, createDatabase, runMigrations } from "../database";
import { bootstrapMigrationJournal } from "../database/bootstrap";
import { ServiceContainer } from "./ServiceContainer";
import { WalletService } from "./WalletService";
import { AssetService } from "./AssetService";
import { PublishingService } from "./PublishingService";
import { QueueService } from "./QueueService";
import { StorageService } from "./StorageService";
import { MetricsService } from "./MetricsService";
import { HealthMonitor } from "./HealthMonitor";
import { QueuePoller } from "./QueuePoller";
import { DkgService } from "./DkgService";
import type { KnowledgeAssetManagerConfig } from "../types";

export type ServiceConfig = KnowledgeAssetManagerConfig;

/**
 * Initialize all services and register them in the container
 */
export async function initializeServices(
  config: ServiceConfig,
): Promise<ServiceContainer> {
  console.log(`🔧 initializeServices called at ${Date.now()}`);
  const container = new ServiceContainer();

  // Initialize database and run migrations
  const db = createDatabase(config.database.connectionString);
  container.register("db", db);

  await bootstrapMigrationJournal(db);
  await runMigrations(config.database.connectionString);

  // Initialize Redis
  const redis = new IORedis({
    host: config.redis.host,
    port: config.redis.port || 6379,
    password: config.redis.password,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });
  container.register("redis", redis);

  // Initialize core services
  const storageService = new StorageService();
  container.register("storageService", storageService);

  const walletService = new WalletService(db);
  container.register("walletService", walletService);

  const dkgService = new DkgService(walletService);
  container.register("dkgService", dkgService);

  const assetService = new AssetService(db, storageService);
  container.register("assetService", assetService);

  const publishingService = new PublishingService(db, dkgService);
  container.register("publishingService", publishingService);

  const queueService = new QueueService(
    redis,
    publishingService,
    walletService,
    assetService,
  );
  container.register("queueService", queueService);

  const metricsService = new MetricsService(db);
  container.register("metricsService", metricsService);

  const healthMonitor = new HealthMonitor(db, assetService, walletService);
  container.register("healthMonitor", healthMonitor);

  // Create QueuePoller - the intelligent queue manager
  const queuePoller = new QueuePoller(
    assetService,
    walletService,
    queueService,
    {
      pollFrequency: parseInt(process.env.POLL_FREQUENCY || "2000"), // 2 seconds default
    },
  );
  container.register("queuePoller", queuePoller);

  // Connect health monitor to queue service for stuck asset recovery
  queueService.setHealthMonitor(healthMonitor);

  // Connect queue service to health monitor for Redis job cleanup
  healthMonitor.setQueueService(queueService);

  // Start health monitoring
  healthMonitor.start();

  // Start the intelligent queue poller
  await queuePoller.start();
  console.log("✅ QueuePoller started - managing asset processing queue");

  // Start queue workers (concurrency auto-calculated from wallet count)
  const workerCount = parseInt(process.env.WORKER_COUNT || "1");
  console.log(
    `🚀 Starting ${workerCount} queue workers (concurrency will be auto-calculated)...`,
  );
  await queueService.startWorkers(workerCount);
  console.log(`✅ ${workerCount} queue workers started at ${Date.now()}`);

  return container;
}

/**
 * Gracefully shutdown all services
 */
export async function shutdownServices(
  container: ServiceContainer,
): Promise<void> {
  try {
    // Stop queue poller first
    if (container.has("queuePoller")) {
      const queuePoller = container.get<QueuePoller>("queuePoller");
      await queuePoller.stop();
    }

    // Stop health monitor
    if (container.has("healthMonitor")) {
      const healthMonitor = container.get<HealthMonitor>("healthMonitor");
      healthMonitor.stop();
    }

    // Cleanup asset service event listeners
    if (container.has("assetService")) {
      const assetService = container.get<AssetService>("assetService");
      assetService.cleanup();
    }

    // Stop and cleanup queue service
    if (container.has("queueService")) {
      const queueService = container.get<QueueService>("queueService");
      await queueService.cleanup();
    }

    // Close Redis connection
    if (container.has("redis")) {
      const redis = container.get<IORedis>("redis");
      await redis.quit();
    }

    // Clear container
    container.clear();

    console.log("✅ All services shut down gracefully");
  } catch (error) {
    console.error("Error during service shutdown:", error);
  }
}

// Re-export all services for convenience
export { ServiceContainer } from "./ServiceContainer";
export { WalletService } from "./WalletService";
export { AssetService } from "./AssetService";
export { PublishingService } from "./PublishingService";
export { QueueService } from "./QueueService";
export { StorageService } from "./StorageService";
export { MetricsService } from "./MetricsService";
export { HealthMonitor } from "./HealthMonitor";
export { QueuePoller } from "./QueuePoller";
export { DkgService } from "./DkgService";
