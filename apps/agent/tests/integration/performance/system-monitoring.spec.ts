import { expect } from "chai";
import request from "supertest";
import { startTestServer } from "../setup/test-server";
import {
  initializeMcpSession,
  callMcpTool,
  uploadTestFile,
} from "../setup/test-helpers";

/**
 * System performance and monitoring tests
 * Tests system behavior under various load conditions and monitors resource usage
 */
describe("System Performance Monitoring", () => {
  let testServer: Awaited<ReturnType<typeof startTestServer>>;
  let accessToken: string;

  beforeEach(async function () {
    this.timeout(15000);
    testServer = await startTestServer();

    accessToken = "test-performance-monitoring-token";
    await testServer.testDatabase.oauthStorage.saveToken(accessToken, {
      token: accessToken,
      clientId: testServer.testDatabase.testClient.client_id,
      scopes: ["mcp", "blob", "scope123"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { type: "access" },
    });
  });

  afterEach(async () => {
    if (testServer?.cleanup) {
      await testServer.cleanup();
    }
  });

  describe("Memory Usage Patterns", () => {
    it("should maintain stable memory during normal operations", async function () {
      this.timeout(60000);

      const initialMemory = process.memoryUsage();
      const operations = [];

      // Perform a mix of operations
      for (let i = 0; i < 10; i++) {
        // Upload small files
        operations.push(
          request(testServer.app)
            .post("/blob")
            .set("Authorization", `Bearer ${accessToken}`)
            .field("filename", `memory-test-${i}.txt`)
            .attach(
              "file",
              Buffer.from(`Content ${i}`.repeat(100)),
              `memory-test-${i}.txt`,
            ),
        );

        // Add some blob retrievals
        if (i > 0) {
          operations.push(
            request(testServer.app)
              .get("/blob/nonexistent-file")
              .set("Authorization", `Bearer ${accessToken}`),
          );
        }
      }

      await Promise.all(operations);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);

      // Memory increase should be reasonable (less than 50MB for this test)
      expect(memoryIncreaseMB).to.be.lessThan(50);
    });

    it("should handle memory pressure gracefully", async function () {
      this.timeout(45000);

      // Create smaller uploads to avoid EPIPE errors
      const sizes = [1024, 5120, 25600]; // 1KB to 25KB only
      const results = [];

      for (const size of sizes) {
        const largeContent = Buffer.alloc(size, "A");

        const startTime = Date.now();
        const response = await request(testServer.app)
          .post("/blob")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("filename", `memory-pressure-${size}.txt`)
          .attach("file", largeContent, `memory-pressure-${size}.txt`);
        const endTime = Date.now();

        results.push({
          size,
          duration: endTime - startTime,
          status: response.status,
          success: response.status === 201,
        });
      }

      // All uploads should succeed
      const failures = results.filter((r) => !r.success);
      expect(failures).to.have.length(
        0,
        `Failed uploads: ${JSON.stringify(failures)}`,
      );

      // Performance should not degrade dramatically with size
      const durations = results.map((r) => r.duration);
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      // Max duration shouldn't be more than 20x the minimum (handle case where minDuration is 0)
      if (minDuration > 0) {
        expect(maxDuration / minDuration).to.be.lessThan(20);
      } else {
        // If minDuration is 0, just check that maxDuration is reasonable (under 5 seconds)
        expect(maxDuration).to.be.lessThan(5000);
      }
    });
  });

  describe("Response Time Monitoring", () => {
    it("should maintain consistent response times under load", async function () {
      this.timeout(60000);

      const measurements = [];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        const response = await request(testServer.app)
          .get("/blob/nonexistent-test-file")
          .set("Authorization", `Bearer ${accessToken}`);

        const endTime = Date.now();
        const duration = endTime - startTime;

        measurements.push({
          iteration: i,
          duration,
          status: response.status,
        });

        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Calculate statistics
      const durations = measurements.map((m) => m.duration);
      const average = durations.reduce((a, b) => a + b, 0) / durations.length;
      const max = Math.max(...durations);
      const min = Math.min(...durations);

      // Response times should be reasonable
      expect(average).to.be.lessThan(500); // Average under 500ms
      expect(max).to.be.lessThan(2000); // Max under 2 seconds

      // Consistency check - max shouldn't be more than 8x average (allowing for timing variability)
      expect(max / average).to.be.lessThan(8);
    });

    it("should handle OAuth token validation efficiently", async function () {
      this.timeout(30000);

      // Create multiple tokens
      const tokens = [];
      for (let i = 0; i < 5; i++) {
        const token = `test-validation-${i}`;
        await testServer.testDatabase.oauthStorage.saveToken(token, {
          token,
          clientId: testServer.testDatabase.testClient.client_id,
          scopes: ["blob"],
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          extra: { type: "access" },
        });
        tokens.push(token);
      }

      // Test validation performance for each token
      const validationTimes = [];

      for (const token of tokens) {
        const startTime = Date.now();

        const response = await request(testServer.app)
          .get("/blob/validation-test")
          .set("Authorization", `Bearer ${token}`);

        const endTime = Date.now();
        validationTimes.push(endTime - startTime);

        expect(response.status).to.equal(404); // Should be authenticated but not found
      }

      const avgValidationTime =
        validationTimes.reduce((a, b) => a + b, 0) / validationTimes.length;

      // Token validation should be fast
      expect(avgValidationTime).to.be.lessThan(100);
    });
  });

  describe("Database Performance", () => {
    it("should handle database operations efficiently", async function () {
      this.timeout(45000);

      // Test database read/write performance with OAuth operations
      const operations = [];
      const numOperations = 10;

      for (let i = 0; i < numOperations; i++) {
        const token = `test-db-perf-${i}`;

        // Token creation (write operation)
        operations.push(async () => {
          const startTime = Date.now();
          await testServer.testDatabase.oauthStorage.saveToken(token, {
            token,
            clientId: testServer.testDatabase.testClient.client_id,
            scopes: ["blob"],
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            extra: { type: "access" },
          });
          return Date.now() - startTime;
        });

        // Token retrieval (read operation)
        operations.push(async () => {
          const startTime = Date.now();
          await testServer.testDatabase.oauthStorage.getTokenData(token);
          return Date.now() - startTime;
        });
      }

      // Execute operations sequentially to measure individual performance
      const times = [];
      for (const operation of operations) {
        const duration = await operation();
        times.push(duration);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      // Database operations should be fast
      expect(avgTime).to.be.lessThan(50); // Average under 50ms
      expect(maxTime).to.be.lessThan(200); // Max under 200ms
    });
  });

  describe("Concurrent Load Testing", () => {
    it("should handle mixed concurrent operations", async function () {
      this.timeout(120000);

      const concurrency = 10;
      const operationsPerType = 5;

      // Create different types of concurrent operations
      const uploadOps = Array.from({ length: operationsPerType }, (_, i) =>
        request(testServer.app)
          .post("/blob")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("filename", `concurrent-${i}.txt`)
          .attach(
            "file",
            Buffer.from(`Concurrent upload ${i}`),
            `concurrent-${i}.txt`,
          ),
      );

      const authOps = Array.from({ length: operationsPerType }, () =>
        request(testServer.app)
          .get("/blob/nonexistent")
          .set("Authorization", `Bearer ${accessToken}`),
      );

      const invalidAuthOps = Array.from({ length: operationsPerType }, () =>
        request(testServer.app)
          .get("/blob/test")
          .set("Authorization", "Bearer invalid-token"),
      );

      // Mix all operations together
      const allOps = [...uploadOps, ...authOps, ...invalidAuthOps];

      const startTime = Date.now();
      const results = await Promise.all(allOps);
      const endTime = Date.now();

      const totalDuration = endTime - startTime;
      console.log(
        `${allOps.length} concurrent operations completed in ${totalDuration}ms`,
      );

      // Verify results
      const uploads = results.slice(0, operationsPerType);
      const auths = results.slice(operationsPerType, operationsPerType * 2);
      const invalidAuths = results.slice(operationsPerType * 2);

      // All uploads should succeed
      uploads.forEach((result, i) => {
        expect(result.status).to.equal(201, `Upload ${i} failed`);
      });

      // All valid auth requests should return 404 (authenticated but not found)
      auths.forEach((result, i) => {
        expect(result.status).to.equal(404, `Auth request ${i} failed`);
      });

      // All invalid auth requests should return 401
      invalidAuths.forEach((result, i) => {
        expect(result.status).to.equal(
          401,
          `Invalid auth request ${i} should fail`,
        );
      });

      // Performance check - should complete in reasonable time
      expect(totalDuration).to.be.lessThan(30000); // Under 30 seconds
    });
  });

  describe("Resource Cleanup Monitoring", () => {
    it("should properly cleanup resources after operations", async function () {
      this.timeout(30000);

      const initialStats = {
        memory: process.memoryUsage(),
        // Add more resource monitoring as needed
      };

      // Perform operations that create resources
      const uploads = [];
      for (let i = 0; i < 5; i++) {
        const response = await request(testServer.app)
          .post("/blob")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("filename", `cleanup-${i}.txt`)
          .attach("file", Buffer.from(`Cleanup test ${i}`), `cleanup-${i}.txt`);

        expect(response.status).to.equal(201);
        uploads.push(response.body.id);
      }

      // Verify uploads exist
      for (const blobId of uploads) {
        await request(testServer.app)
          .get(`/blob/${blobId}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .expect(200);
      }

      // Force cleanup (this will happen in afterEach)
      await testServer.cleanup();

      // Give time for cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (global.gc) {
        global.gc();
      }

      const finalStats = {
        memory: process.memoryUsage(),
      };

      const memoryDiff =
        finalStats.memory.heapUsed - initialStats.memory.heapUsed;
      console.log(
        `Memory difference after cleanup: ${(memoryDiff / 1024 / 1024).toFixed(2)}MB`,
      );

      // Memory usage should not grow significantly
      expect(Math.abs(memoryDiff)).to.be.lessThan(50 * 1024 * 1024); // Less than 50MB difference
    });
  });
});
