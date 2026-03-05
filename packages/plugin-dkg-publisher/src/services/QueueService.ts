import { EventEmitter } from "events";
import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { ExpressAdapter } from "@bull-board/express";
import { PublishingService } from "./PublishingService";
import { WalletService } from "./WalletService";
import { AssetService } from "./AssetService";
import { queueLogger as logger } from "./Logger";
import { serializeErrorDetails } from "./errorUtils";

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export class QueueService {
  private publishQueue: Queue;
  private workers: Worker[] = [];
  private queueEvents: QueueEvents;
  private serverAdapter: ExpressAdapter;
  private currentWalletCount: number = 0;
  private walletCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private redis: IORedis,
    private publishingService: PublishingService,
    private walletService: WalletService,
    private assetService: AssetService,
    private healthMonitor?: EventEmitter, // Will be set later to avoid circular dependency
  ) {
    // Initialize queue
    this.publishQueue = new Queue("knowledge-asset-publishing", {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
          count: 50, // Keep last 50 failed jobs to prevent Redis memory issues
        },
        attempts: 1, // We handle retries at application level
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    });

    // Initialize queue events
    this.queueEvents = new QueueEvents("knowledge-asset-publishing", {
      connection: this.redis,
    });

    // Initialize Bull Board dashboard
    this.serverAdapter = new ExpressAdapter();
    this.serverAdapter.setBasePath("/admin/queues");

    createBullBoard({
      queues: [new BullMQAdapter(this.publishQueue)],
      serverAdapter: this.serverAdapter,
    });

    // No event listeners needed - QueuePoller handles all scheduling
  }

  /**
   * Connect health monitor for timeout events
   */
  setHealthMonitor(healthMonitor: EventEmitter): void {
    this.healthMonitor = healthMonitor;
  }

  // Event-driven logic removed - QueuePoller handles all scheduling

  /**
   * Add asset to publishing queue (prevents duplicates)
   */
  async addToQueue(assetId: number, priority?: number): Promise<void> {
    const jobId = `asset-${assetId}`;

    try {
      // Check if job already exists in Redis
      const existingJob = await this.publishQueue.getJob(jobId);

      if (existingJob) {
        const state = await existingJob.getState();

        // If job is in active/waiting/delayed state, it's legitimately in queue
        if (state === 'waiting' || state === 'active' || state === 'delayed') {
          console.log(`⏳ Asset ${assetId} already in queue (${state}), skipping`);
          return;
        }

        // If job is completed or failed, remove it to allow retry
        if (state === 'completed' || state === 'failed') {
          await existingJob.remove();
          console.log(`🗑️  Removed old ${state} job for asset ${assetId} to allow retry`);
        }
      }

      // Now add the job (either fresh or after cleanup)
      await this.publishQueue.add(
        "publish-asset",
        { assetId },
        {
          priority: priority || 50,
          delay: 0,
          jobId: jobId,
        },
      );
      console.log(`✅ Asset ${assetId} added to BullMQ queue`);
    } catch (error: any) {
      if (error.message?.includes("duplicate") || error.message?.includes("already exists")) {
        console.log(`⏳ Asset ${assetId} already in queue (duplicate error), skipping`);
      } else {
        throw error;
      }
    }
  }

  // Recovery logic moved to QueuePoller

  /**
   * Start queue workers with dynamic concurrency based on wallet count
   */
  async startWorkers(workerCount: number = 5): Promise<void> {
    console.log(
      `🔍 startWorkers called with count=${workerCount} at ${Date.now()}`,
    );

    // Query actual wallet count from database
    const walletStats = await this.walletService.getWalletStats();
    const walletCount = walletStats.total;

    if (walletCount === 0) {
      throw new Error(
        "Cannot start workers: No wallets found in database. Please add wallets first.",
      );
    }

    // Calculate optimal concurrency per worker
    // Split wallets evenly across workers (round up to use all wallets)
    const concurrencyPerWorker = Math.max(
      1,
      Math.ceil(walletCount / workerCount),
    );
    const totalCapacity = workerCount * concurrencyPerWorker;

    // Calculate dynamic rate limiter based on wallet capacity
    // Allow 50x wallet capacity for large queue buffer and fast backfilling
    // With 30s avg publish time, each wallet can complete ~2 jobs/min
    // 50x multiplier = 25 minutes of queued work per wallet
    // Minimum of 50 to handle small deployments gracefully
    const rateLimit = Math.max(50, walletCount * 50);

    console.log(`📊 Worker Concurrency Configuration:`);
    console.log(`   - Active wallets: ${walletCount}`);
    console.log(`   - Worker count: ${workerCount}`);
    console.log(`   - Concurrency per worker: ${concurrencyPerWorker}`);
    console.log(`   - Total capacity: ${totalCapacity} concurrent jobs`);
    console.log(`   - Actual concurrency: Limited by ${walletCount} wallets`);
    console.log(`   - Rate limit per worker: ${rateLimit} jobs/minute`);

    if (totalCapacity > walletCount) {
      console.log(
        `   ⚠️  Note: ${totalCapacity - walletCount} worker slots will be idle (waiting for wallets)`,
      );
    }

    // Store current wallet count for monitoring
    this.currentWalletCount = walletCount;

    // Start periodic wallet count monitoring (check every 5 minutes)
    this.startWalletMonitoring(workerCount);

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(
        "knowledge-asset-publishing",
        async (job) => {
          const { assetId } = job.data;
          logger.info(
            `\n=== WORKER ${i} STARTED PROCESSING ASSET ${assetId} ===`,
            { workerId: i, jobId: job.id, assetId },
          );

          let attemptId: number | null = null;
          let wallet: any = null;

          try {
            // First, atomically claim the asset for processing
            logger.info(`Worker ${i} attempting to claim asset ${assetId}`, {
              workerId: i,
              assetId,
            });
            const claimed =
              await this.assetService.claimAssetForProcessing(assetId);
            if (!claimed) {
              logger.warn(
                `Asset ${assetId} already being processed by another worker - job will exit`,
                { workerId: i, assetId },
              );
              return; // Another worker is handling it
            }

            logger.info(
              `✅ Asset ${assetId} SUCCESSFULLY CLAIMED by worker ${i}`,
              { workerId: i, assetId },
            );

            // Update job progress
            await job.updateProgress(10);

            // Get wallet from pool
            logger.info(
              `Worker ${i} requesting available wallet for asset ${assetId}`,
              { workerId: i, assetId },
            );
            wallet = await this.walletService.assignWalletToAsset(assetId);
            if (!wallet) {
              logger.error(`❌ NO AVAILABLE WALLETS for asset ${assetId}`, {
                workerId: i,
                assetId,
              });
              throw new Error("No available wallets");
            }
            logger.info(`✅ Got wallet ${wallet.id} for asset ${assetId}`, {
              workerId: i,
              assetId,
              walletId: wallet.id,
            });

            await job.updateProgress(20);

            // Create publishing attempt record BEFORE attempting to publish
            logger.info(
              `Worker ${i} creating publishing attempt for asset ${assetId}`,
              { workerId: i, assetId },
            );
            attemptId = await this.assetService.createPublishingAttempt(
              assetId,
              wallet,
            );
            logger.info(
              `✅ Created publishing attempt ${attemptId} for asset ${assetId}`,
              { attemptId, workerId: i, assetId },
            );

            // Publish asset
            logger.info(
              `🚀 STARTING PUBLISH for asset ${assetId} with wallet ${wallet.id}`,
              { workerId: i, assetId, walletId: wallet.id },
            );
            const result = await this.publishingService.publishAsset(
              assetId,
              wallet,
            );

            await job.updateProgress(100);

            logger.info(`📡 Publishing result for asset ${assetId}`, {
              workerId: i,
              assetId,
              success: result.success,
              error: result.error,
            });

            if (!result.success) {
              logger.error(
                `❌ PUBLISHING FAILED for asset ${assetId}: ${result.error}`,
                { workerId: i, assetId, error: result.error },
              );
              const publishError = new Error(result.error || "Publishing failed");
              if (result.errorDetails) {
                (publishError as any).errorDetails = result.errorDetails;
              }
              throw publishError;
            }

            logger.info(`🎉 PUBLISHING SUCCESSFUL for asset ${assetId}`, {
              workerId: i,
              assetId,
              ual: result.ual,
            });

            // Update publishing attempt record as successful
            if (attemptId && result.success) {
              await this.assetService.updatePublishingAttempt(attemptId, {
                status: "success",
                ual: result.ual,
                transactionHash: result.transactionHash,
                durationSeconds: Math.floor(
                  (Date.now() - job.timestamp) / 1000,
                ),
              });
            }

            // Release wallet on success
            await this.walletService.releaseWallet(wallet.id, true);

            logger.info(
              `=== WORKER ${i} COMPLETED ASSET ${assetId} SUCCESSFULLY ===\n`,
              { workerId: i, assetId },
            );
            return result;
          } catch (error: any) {
            logger.error(
              `💥 WORKER ${i} ERROR processing asset ${assetId}: ${error.message}`,
              {
                workerId: i,
                assetId,
                error: error.message,
                stack: error.stack,
              },
            );
            // Release wallet on failure if we had one
            if (wallet) {
              await this.walletService.releaseWallet(wallet.id, false);
            }

            // Update publishing attempt record as failed
            // Use pre-serialized errorDetails from PublishingService if available,
            // otherwise serialize the raw error (e.g. "No available wallets")
            if (attemptId) {
              await this.assetService.updatePublishingAttempt(attemptId, {
                status: "failed",
                errorType: error.name || "Error",
                errorMessage: error.message,
                errorDetails: error.errorDetails ?? serializeErrorDetails(error),
                durationSeconds: Math.floor(
                  (Date.now() - job.timestamp) / 1000,
                ),
              });
            }

            // Handle failure with retry logic
            await this.assetService.handleAssetFailure(assetId, error.message);

            logger.info(`=== WORKER ${i} FAILED ASSET ${assetId} ===\n`, {
              workerId: i,
              assetId,
            });
            throw error;
          }
        },
        {
          connection: this.redis,
          concurrency: concurrencyPerWorker, // Dynamically calculated from wallet count
          limiter: {
            max: 1000000, // it will be limited by wallets count
            duration: 60000, // jobs per minute
          },
          lockDuration: 900000, // 15 minutes - aligns with HealthMonitor timeout
          lockRenewTime: 30000, // Renew lock every 30s while actively processing
        },
      );

      worker.on("completed", (job) => {
        logger.info(`Job ${job.id} completed for asset ${job.data.assetId}`, {
          jobId: job.id,
          assetId: job.data.assetId,
        });
      });

      worker.on("failed", (job, err) => {
        logger.error(`Job ${job?.id} failed`, {
          jobId: job?.id,
          assetId: job?.data?.assetId,
          error: err.message,
        });
      });

      worker.on("ready", () => {
        logger.info(`Worker ${i} is ready and listening for jobs`, {
          workerId: i,
        });
        // Test Redis connection and worker registration
        this.redis
          .ping()
          .then(() => {
            logger.info(`Worker ${i} Redis connection test: SUCCESS`, {
              workerId: i,
            });
            // Check if worker is registered in Redis
            return this.redis.hgetall(`bl:knowledge-asset-publishing:workers`);
          })
          .then((workers) => {
            const workerCount = Object.keys(workers).length;
            logger.info(
              `Worker ${i} Redis registration check - Active workers in Redis: ${workerCount}`,
              { workerId: i, activeWorkers: workerCount },
            );
          })
          .catch((err) => {
            logger.error(
              `Worker ${i} Redis connection/registration test: FAILED`,
              { workerId: i, error: err.message },
            );
          });
      });

      worker.on("error", (err) => {
        logger.error(`Worker ${i} error`, { workerId: i, error: err.message });
      });

      this.workers.push(worker);

      // Debug: Log worker details
      console.log(`🔍 Creating worker ${i} at ${Date.now()}`);
      logger.info(
        `Worker ${i} created with queue name: knowledge-asset-publishing`,
        {
          workerId: i,
          queueName: "knowledge-asset-publishing",
          redisHost: this.redis.options.host,
          redisPort: this.redis.options.port,
        },
      );
    }

    logger.info(`All ${workerCount} workers started successfully`);
  }

  /**
   * Monitor wallet count and automatically restart workers if needed
   */
  private startWalletMonitoring(workerCount: number): void {
    // Clear any existing interval
    if (this.walletCheckInterval) {
      clearInterval(this.walletCheckInterval);
    }

    // Check wallet count every 5 minutes
    this.walletCheckInterval = setInterval(
      async () => {
        try {
          const walletStats = await this.walletService.getWalletStats();
          const newWalletCount = walletStats.total;

          if (newWalletCount !== this.currentWalletCount) {
            const change = newWalletCount - this.currentWalletCount;
            const changeText = change > 0 ? `+${change}` : `${change}`;

            console.log(
              `\n🔄 Wallet count changed: ${this.currentWalletCount} → ${newWalletCount} (${changeText})`,
            );

            // Calculate new optimal concurrency
            const newConcurrencyPerWorker = Math.max(
              1,
              Math.ceil(newWalletCount / workerCount),
            );
            const oldConcurrencyPerWorker = Math.max(
              1,
              Math.ceil(this.currentWalletCount / workerCount),
            );

            if (newConcurrencyPerWorker !== oldConcurrencyPerWorker) {
              console.log(
                `⚠️  Optimal concurrency changed: ${oldConcurrencyPerWorker} → ${newConcurrencyPerWorker} per worker`,
              );
              console.log(
                `🔄 Automatically restarting workers to apply new concurrency...`,
              );

              // Restart workers with new concurrency
              await this.stopWorkers();
              await this.startWorkers(workerCount);

              console.log(
                `✅ Workers restarted successfully with new concurrency\n`,
              );
            } else {
              console.log(
                `   Concurrency remains optimal at ${newConcurrencyPerWorker} per worker (no restart needed)\n`,
              );
            }

            this.currentWalletCount = newWalletCount;
          }
        } catch (error: any) {
          logger.error("Error during wallet count monitoring", {
            error: error.message,
          });
        }
      },
      5 * 60 * 1000,
    ); // Every 5 minutes

    logger.info(
      "Wallet count monitoring started (checks every 5 minutes, auto-restarts workers if needed)",
    );
  }

  /**
   * Stop all workers
   */
  async stopWorkers(): Promise<void> {
    // Remove event listeners from workers before closing
    this.workers.forEach((worker) => {
      worker.removeAllListeners("completed");
      worker.removeAllListeners("failed");
      worker.removeAllListeners("error");
    });

    await Promise.all(this.workers.map((worker) => worker.close()));
    this.workers = [];
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.publishQueue.getWaitingCount(),
      this.publishQueue.getActiveCount(),
      this.publishQueue.getCompletedCount(),
      this.publishQueue.getFailedCount(),
      this.publishQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  }

  /**
   * Get Bull Board dashboard middleware
   */
  getDashboard() {
    return this.serverAdapter.getRouter();
  }

  /**
   * Pause queue processing
   */
  async pauseQueue(): Promise<void> {
    await this.publishQueue.pause();
  }

  /**
   * Resume queue processing
   */
  async resumeQueue(): Promise<void> {
    await this.publishQueue.resume();
  }

  /**
   * Clear completed jobs
   */
  async clearCompleted(): Promise<void> {
    await this.publishQueue.clean(0, 0, "completed");
  }

  /**
   * Clear failed jobs
   */
  async clearFailed(): Promise<void> {
    await this.publishQueue.clean(0, 0, "failed");
  }

  /**
   * Retry all failed jobs
   */
  async retryFailed(): Promise<number> {
    const failedJobs = await this.publishQueue.getFailed();
    let retryCount = 0;

    for (const job of failedJobs) {
      await job.retry();
      retryCount++;
    }

    return retryCount;
  }

  /**
   * Complete cleanup of QueueService
   */
  async cleanup(): Promise<void> {
    // Stop wallet monitoring
    if (this.walletCheckInterval) {
      clearInterval(this.walletCheckInterval);
      this.walletCheckInterval = null;
    }

    // Stop all workers first
    await this.stopWorkers();

    // Clean up queue events listeners
    if (this.queueEvents) {
      this.queueEvents.removeAllListeners("completed");
      this.queueEvents.removeAllListeners("failed");
      this.queueEvents.removeAllListeners("error");
      await this.queueEvents.close();
    }

    // Close the queue
    if (this.publishQueue) {
      await this.publishQueue.close();
    }

    console.log("✅ QueueService cleanup completed");
  }
}
