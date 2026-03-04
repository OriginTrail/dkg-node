import path from "path";
import { config as dotenvConfig } from "dotenv";
import type { KnowledgeAssetManagerConfig } from "./types";

export interface PublisherRuntimeSettings {
  dkgEndpoint: string;
  dkgBlockchain: string;
  workerCount: number;
  pollFrequency: number;
  storageType: "filesystem" | "s3";
  storagePath: string;
  storageBaseUrl: string;
  redisUrl: string;
}

export interface PublisherConfigResolution {
  config: KnowledgeAssetManagerConfig;
  runtime: PublisherRuntimeSettings;
  legacyEnvPath: string;
  loadedLegacyEnv: boolean;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadLegacyPublisherEnv(): {
  legacyEnvPath: string;
  loadedLegacyEnv: boolean;
} {
  const legacyEnvPath = path.resolve(__dirname, "..", ".env.publisher");
  const hasPublisherConfig =
    Boolean(process.env.DKGP_DATABASE_URL) &&
    Boolean(
      process.env.REDIS_URL ||
        process.env.REDIS_HOST ||
        process.env.REDIS_PORT ||
        process.env.REDIS_PASSWORD,
    );

  if (!hasPublisherConfig) {
    dotenvConfig({ path: legacyEnvPath });
  }

  return {
    legacyEnvPath,
    loadedLegacyEnv: !hasPublisherConfig && Boolean(process.env.DKGP_DATABASE_URL),
  };
}

function getDefaultStorageBaseUrl(): string {
  const baseUrl =
    process.env.EXPO_PUBLIC_MCP_URL || `http://localhost:${process.env.PORT || "9200"}`;
  return new URL("/storage", baseUrl).toString().replace(/\/$/, "");
}

function resolveRedisSettings() {
  const redisUrl =
    process.env.REDIS_URL ||
    `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`;

  const parsedRedisUrl = new URL(redisUrl);

  return {
    redisUrl,
    host: parsedRedisUrl.hostname || "localhost",
    port: Number(parsedRedisUrl.port || 6379),
    password:
      parsedRedisUrl.password || process.env.REDIS_PASSWORD || undefined,
  };
}

export function resolvePublisherRuntimeConfig(): PublisherConfigResolution | null {
  const { legacyEnvPath, loadedLegacyEnv } = loadLegacyPublisherEnv();
  const databaseUrl = process.env.DKGP_DATABASE_URL;

  if (!databaseUrl) {
    return null;
  }

  const redis = resolveRedisSettings();
  const storageType =
    process.env.STORAGE_TYPE === "s3" ? "s3" : "filesystem";
  const storagePath =
    process.env.STORAGE_PATH || path.resolve(process.cwd(), "data/publisher");
  const storageBaseUrl =
    process.env.STORAGE_BASE_URL || getDefaultStorageBaseUrl();
  const dkgEndpoint =
    process.env.DKG_OTNODE_URL ||
    process.env.DKG_ENDPOINT ||
    "http://localhost:8900";
  const dkgBlockchain = process.env.DKG_BLOCKCHAIN || "hardhat1:31337";
  const workerCount = parsePositiveInt(process.env.WORKER_COUNT, 1);
  const pollFrequency = parsePositiveInt(process.env.POLL_FREQUENCY, 2000);

  return {
    legacyEnvPath,
    loadedLegacyEnv,
    runtime: {
      dkgEndpoint,
      dkgBlockchain,
      workerCount,
      pollFrequency,
      storageType,
      storagePath,
      storageBaseUrl,
      redisUrl: redis.redisUrl,
    },
    config: {
      database: {
        connectionString: databaseUrl,
      },
      redis: {
        host: redis.host,
        port: redis.port,
        password: redis.password,
      },
      wallets: [],
      dkg: {
        endpoint: dkgEndpoint,
        blockchain: dkgBlockchain,
      },
      storage: {
        type: storageType,
        path: storagePath,
      },
    },
  };
}

export function applyPublisherRuntimeDefaults(
  resolution: PublisherConfigResolution,
) {
  process.env.DKGP_DATABASE_URL ||= resolution.config.database.connectionString;
  process.env.REDIS_URL ||= resolution.runtime.redisUrl;
  process.env.DKG_OTNODE_URL ||= resolution.runtime.dkgEndpoint;
  process.env.DKG_BLOCKCHAIN ||= resolution.runtime.dkgBlockchain;
  process.env.WORKER_COUNT ||= resolution.runtime.workerCount.toString();
  process.env.POLL_FREQUENCY ||= resolution.runtime.pollFrequency.toString();
  process.env.STORAGE_TYPE ||= resolution.runtime.storageType;
  process.env.STORAGE_PATH ||= resolution.runtime.storagePath;
  process.env.STORAGE_BASE_URL ||= resolution.runtime.storageBaseUrl;
}
