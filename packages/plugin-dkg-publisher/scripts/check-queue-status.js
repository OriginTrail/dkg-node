#!/usr/bin/env node

const { Queue } = require("bullmq");
const IORedis = require("ioredis");

async function checkQueueStatus() {
  console.log("🔍 Checking BullMQ queue status...\n");

  const redisUrl =
    process.env.REDIS_URL ||
    `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`;
  const parsedRedisUrl = new URL(redisUrl);

  // Connect to Redis (same config as the service)
  const redis = new IORedis({
    host: parsedRedisUrl.hostname || "localhost",
    port: Number(parsedRedisUrl.port || 6379),
    password: parsedRedisUrl.password || process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });

  // Connect to the queue
  const queue = new Queue("knowledge-asset-publishing", {
    connection: redis,
  });

  try {
    // Get queue statistics
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    console.log("📊 Queue Statistics:");
    console.log(`   Waiting: ${waiting}`);
    console.log(`   Active: ${active}`);
    console.log(`   Completed: ${completed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Delayed: ${delayed}\n`);

    // Get waiting jobs details
    if (waiting > 0) {
      console.log("⏳ Waiting Jobs:");
      const waitingJobs = await queue.getWaiting(0, 10); // Get first 10
      waitingJobs.forEach((job) => {
        console.log(
          `   Job ID: ${job.id}, Asset ID: ${job.data.assetId}, Created: ${new Date(job.timestamp).toISOString()}`,
        );
      });
      console.log("");
    }

    // Get active jobs details
    if (active > 0) {
      console.log("🔄 Active Jobs:");
      const activeJobs = await queue.getActive(0, 10); // Get first 10
      activeJobs.forEach((job) => {
        console.log(
          `   Job ID: ${job.id}, Asset ID: ${job.data.assetId}, Started: ${new Date(job.processedOn || job.timestamp).toISOString()}`,
        );
      });
      console.log("");
    }

    // Get failed jobs details
    if (failed > 0) {
      console.log("❌ Failed Jobs (last 5):");
      const failedJobs = await queue.getFailed(0, 5);
      failedJobs.forEach((job) => {
        console.log(
          `   Job ID: ${job.id}, Asset ID: ${job.data.assetId}, Failed: ${new Date(job.finishedOn || job.timestamp).toISOString()}, Reason: ${job.failedReason}`,
        );
      });
      console.log("");
    }

    // Check if queue is paused
    const isPaused = await queue.isPaused();
    console.log(`🎛️ Queue Status: ${isPaused ? "⏸️ PAUSED" : "▶️ RUNNING"}\n`);

    // Get queue health info - check for active workers
    console.log("🏥 Queue Health:");
    const workers = await redis.hgetall(
      `bl:knowledge-asset-publishing:workers`,
    );

    const workerCount = Object.keys(workers).length;
    console.log(`   Active Workers: ${workerCount}`);

    if (workerCount === 0) {
      console.log(
        "   ⚠️ NO WORKERS DETECTED! This explains why jobs aren't being processed.",
      );
      console.log(
        "   Make sure workers are started with: queueService.startWorkers()",
      );
    } else {
      console.log("   Workers found:");
      Object.entries(workers).forEach(([workerId, data]) => {
        const workerData = JSON.parse(data);
        console.log(
          `     Worker: ${workerId}, Started: ${new Date(workerData.started).toISOString()}`,
        );
      });
    }

    // Check for duplicate jobs (same asset ID)
    if (waiting > 0) {
      const allWaitingJobs = await queue.getWaiting();
      const assetIds = allWaitingJobs.map((job) => job.data.assetId);
      const duplicates = assetIds.filter(
        (id, index) => assetIds.indexOf(id) !== index,
      );

      if (duplicates.length > 0) {
        console.log(`\n⚠️ DUPLICATE JOBS DETECTED:`);
        const uniqueDuplicates = [...new Set(duplicates)];
        uniqueDuplicates.forEach((assetId) => {
          const count = assetIds.filter((id) => id === assetId).length;
          console.log(`   Asset ${assetId}: ${count} duplicate jobs in queue`);
        });
      }
    }
  } catch (error) {
    console.error("❌ Error checking queue status:", error);
  } finally {
    await queue.close();
    await redis.quit();
  }
}

checkQueueStatus().catch(console.error);
