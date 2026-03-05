import mysql from "mysql2/promise";
import { Wallet } from "ethers";
import { runMigrations } from "./database";
import { normalizePrivateKey, stripPrivateKeyPrefix } from "./privateKey";

export interface PublisherWalletSeed {
  privateKey: string;
  blockchain: string;
}

export interface PublisherProvisionResult {
  databaseCreated: boolean;
  walletsInserted: number;
}

const MYSQL_IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;

function getDatabaseName(connectionString: string) {
  const databaseUrl = new URL(connectionString);
  const databaseName = databaseUrl.pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new Error("DKGP_DATABASE_URL must include a database name");
  }

  if (!MYSQL_IDENTIFIER_PATTERN.test(databaseName)) {
    throw new Error(
      "DKGP_DATABASE_URL contains an invalid database name. Use letters, numbers, and underscores only.",
    );
  }

  return { databaseUrl, databaseName };
}

function getAdminConnectionString(connectionString: string) {
  const { databaseUrl } = getDatabaseName(connectionString);
  databaseUrl.pathname = "/";
  return databaseUrl.toString();
}

export async function provisionPublisherDatabase(
  connectionString: string,
  walletSeeds: PublisherWalletSeed[] = [],
): Promise<PublisherProvisionResult> {
  const { databaseName } = getDatabaseName(connectionString);
  let databaseCreated = false;
  let walletsInserted = 0;

  const adminConnection = await mysql.createConnection(
    getAdminConnectionString(connectionString),
  );

  try {
    const [existingDatabases] = await adminConnection.execute(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
      [databaseName],
    );
    databaseCreated = (existingDatabases as unknown[]).length === 0;

    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\``,
    );
  } finally {
    await adminConnection.end();
  }

  await runMigrations(connectionString);

  if (!walletSeeds.length) {
    return { databaseCreated, walletsInserted };
  }

  const databaseConnection = await mysql.createConnection(connectionString);

  try {
    for (const walletSeed of walletSeeds) {
      const normalizedPrivateKey = normalizePrivateKey(walletSeed.privateKey);
      const storedPrivateKey = stripPrivateKeyPrefix(walletSeed.privateKey);
      const address = new Wallet(normalizedPrivateKey).address;
      const [existingWallets] = await databaseConnection.execute(
        "SELECT id FROM wallets WHERE address = ? LIMIT 1",
        [address],
      );

      if ((existingWallets as unknown[]).length === 0) {
        await databaseConnection.execute(
          "INSERT INTO wallets (address, private_key, blockchain) VALUES (?, ?, ?)",
          [address, storedPrivateKey, walletSeed.blockchain],
        );
        walletsInserted += 1;
      }
    }
  } finally {
    await databaseConnection.end();
  }

  return { databaseCreated, walletsInserted };
}
