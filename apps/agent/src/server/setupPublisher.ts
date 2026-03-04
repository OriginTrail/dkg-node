import path from "path";
import { promises as fs } from "fs";
import dotenv from "dotenv";
import { provisionPublisherDatabase } from "@dkg/plugin-dkg-publisher";

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
  redisUrl?: string;
  workerCount?: number;
  pollFrequency?: number;
  storagePath?: string;
  storageBaseUrl?: string;
}

const MYSQL_IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;

export function resolveNodeRoot(currentWorkingDirectory = process.cwd()) {
  return path.resolve(currentWorkingDirectory, "../..");
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

export function buildPublisherDefaults(
  appUrl: string,
  mysqlPassword: string,
  options: PublisherAdvancedOptions = {},
) {
  return {
    mysqlPassword,
    databaseUrl: buildPublisherDatabaseUrl(mysqlPassword, options),
    redisUrl: options.redisUrl || "redis://localhost:6379",
    workerCount: options.workerCount || 1,
    pollFrequency: options.pollFrequency || 2000,
    storagePath: options.storagePath || "./data/publisher",
    storageBaseUrl:
      options.storageBaseUrl ||
      new URL("/storage", appUrl).toString().replace(/\/$/, ""),
  };
}

export async function provisionAsyncPublishing(
  databaseUrl: string,
  walletSeed?: {
    privateKey: string;
    blockchain: string;
  },
) {
  return provisionPublisherDatabase(databaseUrl, walletSeed);
}
