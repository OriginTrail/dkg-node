import { EventEmitter } from "events";
import { AssetService } from "./AssetService";
import { WalletService } from "./WalletService";
import { QueueService } from "./QueueService";
import { pollerLogger as logger } from "./Logger";

/**
 * QueuePoller - Intelligent background process that manages asset processing queue
 *
 * Responsibilities:
 * - Continuously poll database for queued assets
 * - Check wallet availability before processing
 * - Add assets to BullMQ only when resources are available
 * - Implement intelligent batching and prioritization
 */
export class QueuePoller extends EventEmitter {
  private isRunning = false;
  private isPolling = false; // Prevent concurrent polls
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly pollFrequency: number = 10000; // Poll every 10 seconds

  constructor(
    private assetService: AssetService,
    private walletService: WalletService,
    private queueService: QueueService,
    private options: {
      pollFrequency?: number;
      batchSize?: number;
      maxConcurrency?: number;
    } = {},
  ) {
    super();

    if (options.pollFrequency) {
      this.pollFrequency = options.pollFrequency;
    }
  }

  /**
   * Start the poller
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("⚠️ QueuePoller is already running");
      return;
    }

    this.isRunning = true;
    logger.info(`QueuePoller started`, { pollFrequency: this.pollFrequency });

    // Stuck asset recovery is handled by HealthMonitor

    // Start the polling loop
    this.pollInterval = setInterval(() => {
      this.pollAndProcess().catch((error) => {
        console.error("❌ QueuePoller error:", error);
      });
    }, this.pollFrequency);

    // Run initial poll immediately
    await this.pollAndProcess();
  }

  /**
   * Stop the poller
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    console.log("🛑 QueuePoller stopped");
  }

  /**
   * Main polling logic - the heart of the system
   */
  private async pollAndProcess(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Prevent concurrent polls
    if (this.isPolling) {
      logger.debug("Previous poll still running, skipping this cycle");
      return;
    }

    this.isPolling = true;
    const startTime = Date.now();

    try {
      // 1. Check wallet availability
      const walletStats = await this.walletService.getWalletStats();

      if (walletStats.available === 0) {
        logger.debug("No wallets available, skipping poll cycle");
        return;
      }

      // 2. Get current BullMQ queue load
      const queueStats = await this.queueService.getQueueStats();
      const activeJobs = queueStats.waiting + queueStats.active;

      // 3. Available slots = total wallets minus jobs already in queue
      // This prevents adding more jobs than we have wallets to process them
      const availableSlots = Math.max(0, walletStats.total - activeJobs);

      if (availableSlots === 0) {
        logger.debug("No available slots, skipping poll cycle", {
          activeJobs,
          availableWallets: walletStats.available,
          totalWallets: walletStats.total,
        });
        return;
      }

      logger.info("Poll cycle started", {
        availableWallets: walletStats.available,
        activeJobs,
        availableSlots,
      });

      // 4. Get queued assets from database (highest priority first)
      const queuedAssets =
        await this.assetService.getPendingAssets(availableSlots);

      if (queuedAssets.length === 0) {
        logger.info("No queued assets to process");
        return;
      }

      logger.info(`Processing queued assets`, { count: queuedAssets.length });

      // 5. Add assets to BullMQ for processing
      let addedCount = 0;
      for (const asset of queuedAssets) {
        try {
          await this.queueService.addToQueue(asset.id, asset.priority, "publish-asset");
          addedCount++;
          logger.logAssetEvent(asset.id, "Added to processing queue", {
            priority: asset.priority,
          });
        } catch (error: any) {
          if (error.message?.includes("duplicate job id")) {
            logger.debug(`Asset ${asset.id} already in queue, skipping`);
          } else {
            logger.error(`Failed to add asset ${asset.id} to queue`, {
              error: error.message,
            });
          }
        }
      }

      if (addedCount > 0) {
        logger.info(`Poll cycle completed`, { assetsAdded: addedCount });
      }
    } catch (error: any) {
      logger.error("Error in poll cycle", {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      const duration = Date.now() - startTime;
      if (duration > this.pollFrequency) {
        logger.warn(`Poll cycle took longer than interval`, {
          duration,
          expectedInterval: this.pollFrequency,
        });
      }
      logger.logPerformance("Poll cycle", duration);
      this.isPolling = false;
    }
  }

  /**
   * Get poller status and statistics
   */
  getStatus(): {
    running: boolean;
    pollFrequency: number;
    maxConcurrency?: number;
  } {
    return {
      running: this.isRunning,
      pollFrequency: this.pollFrequency,
      maxConcurrency: this.options.maxConcurrency,
    };
  }
}
