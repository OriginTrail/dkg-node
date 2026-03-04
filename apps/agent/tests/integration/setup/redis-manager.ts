import { spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

export class RedisManager {
  private redisProcess: ChildProcess | null = null;
  private isStarted = false;

  async startRedis(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    try {
      // Check if Redis is already running
      await execAsync("redis-cli ping");
      console.log("✅ Redis is already running");
      this.isStarted = true;
      return;
    } catch (error: any) {
      // Redis is not running, start it
      console.log("🚀 Starting Redis for integration tests...");

      try {
        // Try to start Redis via brew services
        await execAsync("brew services start redis");
        console.log("✅ Redis started via brew services");
        this.isStarted = true;
        return;
      } catch (brewError) {
        console.log(
          "⚠️  Could not start Redis via brew services, trying direct start...",
        );

        // Fallback: start Redis directly
        this.redisProcess = spawn("redis-server", ["--port", "6379"], {
          stdio: "pipe",
          detached: false,
        });

        this.redisProcess.on("error", (error) => {
          console.error("❌ Failed to start Redis:", error);
        });

        this.redisProcess.on("exit", (code) => {
          if (code !== 0) {
            console.error(`❌ Redis exited with code ${code}`);
          }
        });

        // Wait a moment for Redis to start
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify Redis is running
        try {
          await execAsync("redis-cli ping");
          console.log("✅ Redis started successfully");
          this.isStarted = true;
        } catch (verifyError) {
          console.error("❌ Redis verification failed:", verifyError);
          throw new Error("Failed to start Redis");
        }
      }
    }
  }

  async stopRedis(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      if (this.redisProcess) {
        // Stop the process we started
        this.redisProcess.kill("SIGTERM");
        this.redisProcess = null;
        console.log("✅ Redis process stopped");
      } else {
        // Try to stop via brew services
        try {
          await execAsync("brew services stop redis");
          console.log("✅ Redis stopped via brew services");
        } catch (error: any) {
          console.log("⚠️  Could not stop Redis via brew services");
        }
      }
    } catch (error: any) {
      console.error("❌ Error stopping Redis:", error);
    } finally {
      this.isStarted = false;
    }
  }

  async isRedisRunning(): Promise<boolean> {
    try {
      await execAsync("redis-cli ping");
      return true;
    } catch (error: any) {
      return false;
    }
  }
}

// Global Redis manager instance
export const redisManager = new RedisManager();
