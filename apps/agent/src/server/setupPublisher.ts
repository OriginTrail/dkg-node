import path from "path";
import { promises as fs } from "fs";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { provisionPublisherDatabase } from "@dkg/plugin-dkg-publisher/provision";
import {
  isValidPrivateKey,
  normalizePrivateKey,
  stripPrivateKeyPrefix,
} from "@dkg/plugin-dkg-publisher/privateKey";

export type AsyncPublishingMode = "disabled" | "recommended" | "advanced";

export interface EnginePasswordResolution {
  envPath: string;
  mysqlPassword: string | null;
  status: "found" | "missing-file" | "missing-key";
}

export interface PublisherAdvancedOptions {
  mysqlHost?: string;
  mysqlPort?: number;
  mysqlUser?: string;
  mysqlDatabase?: string;
  redisHost?: string;
  redisPort?: number;
  redisPassword?: string;
  redisUrl?: string;
  workerCount?: number;
  pollFrequency?: number;
  storagePath?: string;
  storageBaseUrl?: string;
}

export interface AgentEnvState {
  envPath: string;
  content: string;
  values: Record<string, string>;
}

export interface PublisherMysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface PublisherRedisConfig {
  host: string;
  port: number;
  password: string;
}

export interface PublisherResolvedConfig {
  databaseUrl: string;
  redisUrl: string;
  workerCount: number;
  pollFrequency: number;
  storagePath: string;
  storageBaseUrl: string;
  mysql: PublisherMysqlConfig;
  redis: PublisherRedisConfig;
}

export interface PublisherWalletRecord {
  id: number;
  address: string;
  blockchain: string;
  isActive: boolean;
  isLocked: boolean;
  lockedAt: Date | null;
  lastUsedAt: Date | null;
  totalUses: number;
  successfulUses: number;
  failedUses: number;
  createdAt: Date | null;
}

export interface PublisherWalletActivationResult {
  id: number;
  address: string;
  isActive: boolean;
  wasLocked: boolean;
  forcedUnlock: boolean;
}

export interface PublisherResetResult {
  droppedTables: string[];
  databaseCreated: boolean;
  walletsInserted: number;
}

const MYSQL_IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;
const ENV_KEY_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;
const DEFAULT_APP_URL = "http://localhost:9200";
const DEFAULT_STORAGE_PATH = "./data/publisher";
const DEFAULT_POLL_FREQUENCY = 2000;
const PUBLISHER_TABLES = [
  "__drizzle_migrations",
  "wallet_metrics",
  "publishing_attempts",
  "assets",
  "wallets",
  "batches",
  "metrics_hourly",
] as const;

export function resolveNodeRoot(currentWorkingDirectory = process.cwd()) {
  return path.resolve(currentWorkingDirectory, "../..");
}

export function resolveAgentEnvPath(currentWorkingDirectory = process.cwd()) {
  return path.resolve(currentWorkingDirectory, ".env");
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function serializeEnvValue(value: string | number | boolean) {
  if (typeof value === "number" || typeof value === "boolean") {
    return `${value}`;
  }

  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseMysqlConnectionString(databaseUrl: string): PublisherMysqlConfig {
  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

  if (!database) {
    throw new Error("DKGP_DATABASE_URL must include a database name");
  }

  if (!MYSQL_IDENTIFIER_PATTERN.test(database)) {
    throw new Error(
      "DKGP_DATABASE_URL contains an invalid database name. Use letters, numbers, and underscores only.",
    );
  }

  return {
    host: parsed.hostname || "localhost",
    port: parsePositiveInt(parsed.port, 3306),
    user: decodeURIComponent(parsed.username || "root"),
    password: decodeURIComponent(parsed.password || ""),
    database,
  };
}

function parseRedisConnectionString(redisUrl: string): PublisherRedisConfig {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname || "localhost",
    port: parsePositiveInt(parsed.port, 6379),
    password: decodeURIComponent(parsed.password || ""),
  };
}

function normalizeRedisUrlCandidate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("redis://") || trimmed.startsWith("rediss://")) {
    return trimmed;
  }

  if (!trimmed.includes("://")) {
    return `redis://${trimmed}`;
  }

  return trimmed;
}

async function withPublisherConnection<T>(
  databaseUrl: string,
  operation: (connection: mysql.Connection) => Promise<T>,
) {
  const connection = await mysql.createConnection(databaseUrl);
  try {
    return await operation(connection);
  } finally {
    await connection.end();
  }
}

export async function resolveEngineMysqlPassword(): Promise<EnginePasswordResolution> {
  const envPath =
    process.env.DKG_ENGINE_ENV_PATH ||
    path.join(resolveNodeRoot(), "dkg-engine/current/.env");

  try {
    const envFile = await fs.readFile(envPath, "utf8");
    const parsedEnv = dotenv.parse(envFile);
    const mysqlPassword = parsedEnv.REPOSITORY_PASSWORD?.trim();

    if (!mysqlPassword) {
      return {
        envPath,
        mysqlPassword: null,
        status: "missing-key",
      };
    }

    return {
      envPath,
      mysqlPassword,
      status: "found",
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return {
        envPath,
        mysqlPassword: null,
        status: "missing-file",
      };
    }

    throw error;
  }
}

export function buildPublisherDatabaseUrl(
  mysqlPassword: string,
  options: PublisherAdvancedOptions = {},
) {
  const mysqlUser = options.mysqlUser || "root";
  const mysqlHost = options.mysqlHost || "localhost";
  const mysqlPort = options.mysqlPort || 3306;
  const mysqlDatabase = options.mysqlDatabase || "dkg_publisher_db";

  if (!MYSQL_IDENTIFIER_PATTERN.test(mysqlDatabase)) {
    throw new Error(
      "Publisher MySQL database name may contain only letters, numbers, and underscores",
    );
  }

  const encodedUser = encodeURIComponent(mysqlUser);
  const encodedPassword = encodeURIComponent(mysqlPassword);

  return `mysql://${encodedUser}:${encodedPassword}@${mysqlHost}:${mysqlPort}/${mysqlDatabase}`;
}

export function isValidMysqlIdentifier(value: string) {
  return MYSQL_IDENTIFIER_PATTERN.test(value);
}

export { isValidPrivateKey, normalizePrivateKey, stripPrivateKeyPrefix };

export async function readAgentEnv(
  envPath = resolveAgentEnvPath(),
): Promise<AgentEnvState> {
  const content = await fs.readFile(envPath, "utf8");
  return {
    envPath,
    content,
    values: dotenv.parse(content),
  };
}

export async function upsertAgentEnvValues(
  updates: Record<string, string | number | boolean | null | undefined>,
  envPath = resolveAgentEnvPath(),
) {
  let existingContent = "";
  try {
    existingContent = await fs.readFile(envPath, "utf8");
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const lines = existingContent.length
    ? existingContent.split(/\r?\n/)
    : ([] as string[]);
  const pending = new Map<string, string | null>();

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      pending.set(key, null);
      continue;
    }
    pending.set(key, `${key}=${serializeEnvValue(value)}`);
  }

  const nextLines: string[] = [];
  const seenEnvKeys = new Set<string>();
  for (const line of lines) {
    const match = line.match(ENV_KEY_PATTERN);
    if (!match) {
      nextLines.push(line);
      continue;
    }

    const key = match[1];
    if (!key) {
      nextLines.push(line);
      continue;
    }

    if (seenEnvKeys.has(key)) {
      // Keep only the first occurrence for each env key to avoid ambiguous duplicates.
      continue;
    }
    seenEnvKeys.add(key);

    const replacement = pending.get(key);
    if (replacement !== undefined) {
      if (replacement !== null) {
        nextLines.push(replacement);
      }
      pending.delete(key);
      continue;
    }

    nextLines.push(line);
  }

  for (const replacement of pending.values()) {
    if (replacement !== null) {
      nextLines.push(replacement);
    }
  }

  const nextContent = `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
  await fs.writeFile(envPath, nextContent, "utf8");
  return readAgentEnv(envPath);
}

export function buildRedisUrl(options: PublisherAdvancedOptions = {}) {
  if (options.redisUrl) {
    return options.redisUrl;
  }

  const redisHost = options.redisHost || "localhost";
  const redisPort = options.redisPort || 6379;
  const redisPassword = options.redisPassword?.trim();
  const auth = redisPassword ? `:${encodeURIComponent(redisPassword)}@` : "";

  return `redis://${auth}${redisHost}:${redisPort}`;
}

export function buildPublisherDefaults(
  appUrl: string,
  mysqlPassword: string,
  options: PublisherAdvancedOptions = {},
) {
  return {
    databaseUrl: buildPublisherDatabaseUrl(mysqlPassword, options),
    redisUrl: buildRedisUrl(options),
    workerCount: options.workerCount || 1,
    pollFrequency: options.pollFrequency || 2000,
    storagePath: options.storagePath || "./data/publisher",
    storageBaseUrl:
      options.storageBaseUrl ||
      new URL("/storage", appUrl).toString().replace(/\/$/, ""),
  };
}

export function resolvePublisherConfigFromAgentEnv(
  envValues: Record<string, string>,
  appUrl = DEFAULT_APP_URL,
): PublisherResolvedConfig | null {
  const databaseUrl = envValues.DKGP_DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  const mysql = parseMysqlConnectionString(databaseUrl);
  const fallbackRedisUrl = `redis://${envValues.REDIS_PASSWORD ? `:${encodeURIComponent(envValues.REDIS_PASSWORD)}@` : ""}${envValues.REDIS_HOST || "localhost"}:${envValues.REDIS_PORT || "6379"}`;
  const redisUrlCandidate = normalizeRedisUrlCandidate(envValues.REDIS_URL || "");

  let redisUrl = fallbackRedisUrl;
  let redis: PublisherRedisConfig;
  try {
    if (redisUrlCandidate) {
      redis = parseRedisConnectionString(redisUrlCandidate);
      redisUrl = redisUrlCandidate;
    } else {
      redis = parseRedisConnectionString(fallbackRedisUrl);
    }
  } catch {
    // Recover from malformed REDIS_URL in existing env by falling back to host/port/password.
    redis = parseRedisConnectionString(fallbackRedisUrl);
    redisUrl = fallbackRedisUrl;
  }

  return {
    databaseUrl,
    redisUrl,
    workerCount: parsePositiveInt(envValues.WORKER_COUNT, 1),
    pollFrequency: parsePositiveInt(
      envValues.POLL_FREQUENCY,
      DEFAULT_POLL_FREQUENCY,
    ),
    storagePath: envValues.STORAGE_PATH || DEFAULT_STORAGE_PATH,
    storageBaseUrl:
      envValues.STORAGE_BASE_URL ||
      new URL("/storage", appUrl).toString().replace(/\/$/, ""),
    mysql,
    redis,
  };
}

export async function provisionAsyncPublishing(
  databaseUrl: string,
  walletSeeds: Array<{
    privateKey: string;
    blockchain: string;
  }> = [],
) {
  return provisionPublisherDatabase(databaseUrl, walletSeeds);
}

export async function listPublisherWallets(
  databaseUrl: string,
): Promise<PublisherWalletRecord[]> {
  return withPublisherConnection(databaseUrl, async (connection) => {
    const [rows] = await connection.query<any[]>(
      `SELECT 
         id,
         address,
         blockchain,
         is_active AS isActive,
         is_locked AS isLocked,
         locked_at AS lockedAt,
         last_used_at AS lastUsedAt,
         total_uses AS totalUses,
         successful_uses AS successfulUses,
         failed_uses AS failedUses,
         created_at AS createdAt
       FROM wallets
       ORDER BY created_at ASC, id ASC`,
    );

    return rows.map((row) => ({
      id: Number(row.id),
      address: row.address,
      blockchain: row.blockchain,
      isActive: Boolean(row.isActive),
      isLocked: Boolean(row.isLocked),
      lockedAt: row.lockedAt ? new Date(row.lockedAt) : null,
      lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
      totalUses: Number(row.totalUses || 0),
      successfulUses: Number(row.successfulUses || 0),
      failedUses: Number(row.failedUses || 0),
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
    }));
  });
}

export async function addPublisherWallets(
  databaseUrl: string,
  walletSeeds: Array<{ privateKey: string; blockchain: string }>,
) {
  if (!walletSeeds.length) {
    return { walletsInserted: 0 };
  }

  const result = await provisionPublisherDatabase(databaseUrl, walletSeeds);
  return { walletsInserted: result.walletsInserted };
}

export async function setPublisherWalletActive(
  databaseUrl: string,
  walletId: number,
  isActive: boolean,
  options: { forceUnlock?: boolean } = {},
): Promise<PublisherWalletActivationResult> {
  return withPublisherConnection(databaseUrl, async (connection) => {
    const [rows] = await connection.query<any[]>(
      `SELECT id, address, is_locked AS isLocked FROM wallets WHERE id = ? LIMIT 1`,
      [walletId],
    );

    if (!rows.length) {
      throw new Error(`Wallet with id ${walletId} was not found`);
    }

    const row = rows[0];
    const wasLocked = Boolean(row.isLocked);

    if (!isActive && wasLocked && !options.forceUnlock) {
      throw new Error(
        `Wallet ${walletId} is currently locked and cannot be deactivated without force unlock`,
      );
    }

    let forcedUnlock = false;
    if (!isActive && wasLocked && options.forceUnlock) {
      await connection.execute(
        `UPDATE wallets SET is_locked = FALSE, locked_at = NULL WHERE id = ?`,
        [walletId],
      );
      forcedUnlock = true;
    }

    await connection.execute(`UPDATE wallets SET is_active = ? WHERE id = ?`, [
      isActive,
      walletId,
    ]);

    return {
      id: Number(row.id),
      address: row.address,
      isActive,
      wasLocked,
      forcedUnlock,
    };
  });
}

export async function resetPublisherDatabase(
  databaseUrl: string,
  walletSeeds: Array<{
    privateKey: string;
    blockchain: string;
  }> = [],
): Promise<PublisherResetResult> {
  try {
    await withPublisherConnection(databaseUrl, async (connection) => {
      await connection.execute("SET FOREIGN_KEY_CHECKS = 0");
      try {
        for (const tableName of PUBLISHER_TABLES) {
          await connection.execute(`DROP TABLE IF EXISTS \`${tableName}\``);
        }
      } finally {
        await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
      }
    });
  } catch (error: any) {
    // Database may not exist yet; provisioning below will create it.
    if (error?.code !== "ER_BAD_DB_ERROR") {
      throw error;
    }
  }

  const provisionResult = await provisionPublisherDatabase(databaseUrl, walletSeeds);

  return {
    droppedTables: [...PUBLISHER_TABLES],
    databaseCreated: provisionResult.databaseCreated,
    walletsInserted: provisionResult.walletsInserted,
  };
}
