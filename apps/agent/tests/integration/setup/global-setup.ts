/**
 * Global setup for integration tests
 * This runs before all integration tests
 */
export async function globalSetup(): Promise<void> {
  console.log("🔧 Setting up integration test environment...");

  try {
    // Redis not needed for API contract tests
    // await redisManager.startRedis();
    console.log("✅ Integration test environment ready");
  } catch (error: any) {
    console.error("❌ Failed to setup integration test environment:", error);
    throw error;
  }
}

/**
 * Global teardown for integration tests
 * This runs after all integration tests
 */
export async function globalTeardown(): Promise<void> {
  console.log("🧹 Cleaning up integration test environment...");

  try {
    // Redis not needed for API contract tests
    // await redisManager.stopRedis();
    console.log("✅ Integration test environment cleaned up");
  } catch (error: any) {
    console.error("❌ Error during cleanup:", error);
  }
}

// Auto-setup when this module is loaded
globalSetup().catch(console.error);
