#!/usr/bin/env node

const { Queue } = require("bullmq");
const IORedis = require("ioredis");

async function clearFailedJobs() {
  console.log("🧹 Clearing failed jobs from BullMQ...");

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
    console.log("📊 Before cleanup:");
    const beforeStats = await queue.getJobCounts();
    console.log(beforeStats);

    // Clear all failed jobs
    console.log("\n🗑️ Clearing failed jobs...");
    await queue.clean(0, 0, "failed");

    // Clear all completed jobs older than 1 minute
    console.log("🗑️ Clearing old completed jobs...");
    await queue.clean(60 * 1000, 0, "completed");

    // Also clean waiting jobs to remove any duplicates
    console.log("🗑️ Clearing waiting jobs...");
    await queue.clean(0, 0, "waiting");

    console.log("\n📊 After cleanup:");
    const afterStats = await queue.getJobCounts();
    console.log(afterStats);

    console.log("\n✅ Queue cleanup completed!");
  } catch (error) {
    console.error("❌ Error cleaning queue:", error);
  } finally {
    await queue.close();
    await redis.quit();
  }
}

clearFailedJobs().catch(console.error);
