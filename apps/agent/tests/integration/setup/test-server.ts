import path from "path";
import { createPluginServer, defaultPlugin } from "@dkg/plugins";
import { authorized, createOAuthPlugin } from "@dkg/plugin-oauth";
import dkgEssentialsPlugin from "@dkg/plugin-dkg-essentials";
import createFsBlobStorage from "@dkg/plugin-dkg-essentials/createFsBlobStorage";
import epcisPlugin, { applyEpcisHttpScopeGuards } from "@dkg/plugin-epcis";
import {
  createInMemoryBlobStorage,
  createMockDkgClient,
} from "@dkg/plugins/testing";
import examplePlugin from "@dkg/plugin-example";
import swaggerPlugin from "@dkg/plugin-swagger";
// import dkgPublisherPlugin from "@dkg/plugin-dkg-publisher"; // Disabled for API contract tests - requires MySQL
import { mockDkgPublisherPlugin } from "./mock-dkg-publisher";
import { redisManager } from "./redis-manager";
import { userCredentialsSchema } from "../../../src/shared/auth";
import { processStreamingCompletion } from "../../../src/shared/chat";
import { verify } from "@node-rs/argon2";
import { users } from "../../../src/server/database/sqlite";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "./test-database";
import { Express } from "express";
import fs from "fs";
// DKG imported dynamically only when needed

export interface TestServerConfig {
  useRealDkg?: boolean;
  useRealBlobStorage?: boolean;
  enableWebInterface?: boolean;
  port?: number;
}

/**
 * Creates a test server that mirrors the real agent server setup
 * but with configurable test databases and services
 */
export async function createTestServer(config: TestServerConfig = {}): Promise<{
  app: Express;
  cleanup: () => Promise<void>;
  testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
  oauthUrls: {
    issuerUrl: string;
    loginPageUrl: string;
  };
}> {
  const {
    useRealDkg = false,
    useRealBlobStorage = false,
    enableWebInterface = false,
    port = 0, // Random port
  } = config;

  // Redis not needed for API contract tests (mock plugin doesn't use it)
  // await redisManager.startRedis();

  // Set up test database with users and OAuth storage
  const testDatabase = await createTestDatabase();

  // DKG Publisher environment variables not needed for API contract tests
  // const dkgPublisherEnvPath = path.join(__dirname, "../dkg-publisher.env");
  // if (fs.existsSync(dkgPublisherEnvPath)) {
  //   const envContent = fs.readFileSync(dkgPublisherEnvPath, "utf8");
  //   envContent.split("\n").forEach(line => {
  //     const [key, ...valueParts] = line.split("=");
  //     if (key && !key.startsWith("#") && valueParts.length > 0) {
  //       const value = valueParts.join("=").trim();
  //       if (value) {
  //         process.env[key.trim()] = value;
  //       }
  //     }
  //   });
  //   console.log("🔧 DKG Publisher test environment loaded");
  // }

  const version = "1.0.0-test";
  const baseUrl = `http://localhost:${port || 9200}`;

  // OAuth URLs for testing
  const oauthUrls = {
    issuerUrl: `${baseUrl}/`,
    loginPageUrl: `${baseUrl}/login`,
  };

  // Create OAuth plugin with real storage but test configuration
  const { oauthPlugin, openapiSecurityScheme } = createOAuthPlugin({
    storage: testDatabase.oauthStorage,
    issuerUrl: new URL(oauthUrls.issuerUrl),
    scopesSupported: [
      "mcp",
      "llm",
      "scope123",
      "blob",
      "epcis.read",
      "epcis.write",
    ],
    loginPageUrl: new URL(oauthUrls.loginPageUrl),
    schema: userCredentialsSchema,
    async login(credentials: { email: string; password: string }) {
      // Use the exact same login logic as the real app
      const user = await testDatabase.db
        .select()
        .from(users)
        .where(eq(users.email, credentials.email))
        .then((r) => r.at(0));
      if (!user) throw new Error("Invalid credentials");

      const isValid = await verify(user.password, credentials.password);
      if (!isValid) throw new Error("Invalid credentials");

      return { scopes: user.scope.split(" ") };
    },
  });

  // Set up blob storage
  let blobStorage;
  let tempBlobDir: string | null = null;

  if (useRealBlobStorage) {
    tempBlobDir = path.join(process.cwd(), `test-data-${Date.now()}`);
    fs.mkdirSync(tempBlobDir, { recursive: true });
    blobStorage = createFsBlobStorage(tempBlobDir);
  } else {
    blobStorage = createInMemoryBlobStorage();
  }

  // Set up DKG client
  let dkgClient;
  if (useRealDkg) {
    // Use real DKG for network integration tests - import dynamically to avoid TypeScript issues
    const DKG = (await import("dkg.js" as any)).default;
    dkgClient = new DKG({
      endpoint: process.env.DKG_OTNODE_URL || "http://localhost:8900",
      port: "8900",
      blockchain: {
        name: process.env.DKG_BLOCKCHAIN || "hardhat1:31337",
        privateKey: process.env.DKG_PUBLISH_WALLET || "0x" + "a".repeat(64),
      },
      maxNumberOfRetries: 300,
      frequency: 2,
      contentType: "all",
      nodeApiVersion: "/v1",
    });
  } else {
    dkgClient = createMockDkgClient();
  }

  // Create the app with the exact same structure as the real server
  const app = createPluginServer({
    name: "DKG API Test",
    version,
    context: {
      blob: blobStorage,
      dkg: dkgClient,
    },
    plugins: [
      defaultPlugin,
      oauthPlugin,
      // Same authorization middleware as real app
      (_, __, api) => {
        applyEpcisHttpScopeGuards(api, authorized);
        api.use("/mcp", authorized(["mcp"]));
        api.use("/mcp", (req, res, next) => {
          if (res.locals.auth) {
            (req as any).auth = res.locals.auth;
          }
          next();
        });
        api.use("/llm", authorized(["llm"]));
        api.use("/blob", authorized(["blob"]));
      },
      // Streaming LLM middleware — same as real server
      (_, __, api) => {
        api.post("/llm", (req, res, next) => {
          if (!req.headers.accept?.includes("text/event-stream")) return next();
          processStreamingCompletion(req, res);
        });
      },
      dkgEssentialsPlugin,
      epcisPlugin,
      // DKG Publisher Plugin for API contract testing
      mockDkgPublisherPlugin, // Mock version - tests interfaces without database
      // Test the namespace functionality
      examplePlugin.withNamespace("protected", {
        middlewares: [authorized(["scope123"])],
      }),
      swaggerPlugin({
        version,
        securitySchemes: { oauth2: openapiSecurityScheme },
        servers: [
          {
            url: baseUrl,
            description: "DKG Node Test Server",
          },
        ],
      }),
      // Skip web interface plugin unless specifically enabled
      ...(enableWebInterface
        ? [
            // Would need to set up test static files
          ]
        : []),
    ],
  });

  const cleanup = async () => {
    testDatabase.cleanup();
    if (tempBlobDir && fs.existsSync(tempBlobDir)) {
      fs.rmSync(tempBlobDir, { recursive: true, force: true });
    }
  };

  return {
    app,
    cleanup,
    testDatabase,
    oauthUrls,
  };
}

/**
 * Starts a test server and returns the running instance with cleanup
 */
export async function startTestServer(config: TestServerConfig = {}): Promise<{
  app: Express;
  url: string;
  cleanup: () => Promise<void>;
  testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
  oauthUrls: {
    issuerUrl: string;
    loginPageUrl: string;
  };
}> {
  const {
    app,
    cleanup: serverCleanup,
    testDatabase,
    oauthUrls,
  } = await createTestServer(config);
  const port = config.port || 0;

  return new Promise((resolve, reject) => {
    const server = app.listen(port, (err?: any) => {
      if (err) {
        serverCleanup().catch(console.error);
        reject(err);
        return;
      }

      const actualPort = (server.address() as any)?.port || port;
      const url = `http://localhost:${actualPort}`;
      process.env.EXPO_PUBLIC_MCP_URL = url;

      console.log(`Test server running at ${url}`);

      resolve({
        app,
        url,
        testDatabase,
        oauthUrls: {
          issuerUrl: `${url}/oauth/`,
          loginPageUrl: `${url}/login`,
        },
        cleanup: async () => {
          return new Promise((res) => {
            server.close(async () => {
              await serverCleanup();
              console.log(`Test server stopped`);
              res();
            });
          });
        },
      });
    });
  });
}
