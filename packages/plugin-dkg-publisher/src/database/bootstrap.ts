import { Database } from "./index";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Bootstrap migration journal for databases created by the legacy publisher setup script (raw DDL).
 *
 * The legacy setup script creates tables directly without Drizzle migration tracking.
 * Without this guard, runMigrations() would try to run 0000 (CREATE TABLE)
 * on existing tables and fail.
 *
 * Logic:
 * 1. If __drizzle_migrations exists → already managed by Drizzle, return early
 * 2. If core tables don't all exist → fresh DB, let migrations handle it
 * 3. If tables exist but no journal → seed journal with already-applied migrations
 */
export async function bootstrapMigrationJournal(db: Database): Promise<void> {
  // Check if __drizzle_migrations table exists
  const journalExists = await tableExists(db, "__drizzle_migrations");
  if (journalExists) {
    return; // Already managed by Drizzle
  }

  // Check if core tables exist (legacy setup script creates these)
  const coreTables = ["assets", "wallets", "publishing_attempts", "batches"];
  const existingTables = await Promise.all(
    coreTables.map((t) => tableExists(db, t)),
  );
  const existingCount = existingTables.filter(Boolean).length;

  if (existingCount === 0) {
    return; // Fresh DB — let migrations create everything
  }

  if (existingCount < coreTables.length) {
    const missing = coreTables.filter((_, i) => !existingTables[i]);
    throw new Error(
      `Database is in a partial state: tables ${missing.join(", ")} are missing. ` +
        `This usually means the legacy setup script crashed mid-creation. ` +
        `Please drop all tables and run setup again.`,
    );
  }

  // Tables exist but no journal - legacy setup script-created database
  console.log(
    "Detected legacy setup script-created database without migration journal. Bootstrapping...",
  );

  // Create the __drizzle_migrations table (same schema Drizzle uses)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  // Read migration files and compute hashes to seed the journal
  const migrationsDir = path.join(
    __dirname,
    "../src/database/migrations",
  );
  const journalPath = path.join(migrationsDir, "meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

  // Always seed 0000 and 0001 (legacy setup script schema = post-0001 state)
  for (const entry of journal.entries) {
    if (entry.idx > 1) break; // Only seed 0000 and 0001 unconditionally

    const sqlFile = path.join(migrationsDir, `${entry.tag}.sql`);
    const content = fs.readFileSync(sqlFile, "utf-8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");

    await db.execute(
      sql`INSERT INTO \`__drizzle_migrations\` (hash, created_at) VALUES (${hash}, ${entry.when})`,
    );
  }

  console.log("  ✓ Seeded journal with migrations 0000 and 0001");

  // Check if 0002 changes are already present
  const entry0002 = journal.entries.find(
    (e: { idx: number }) => e.idx === 2,
  );
  if (entry0002) {
    const hasErrorDetails = await columnExists(
      db,
      "publishing_attempts",
      "error_details",
    );
    const hasPrivateKey = await columnExists(db, "wallets", "private_key");

    if (hasErrorDetails && hasPrivateKey) {
      const sqlFile = path.join(migrationsDir, `${entry0002.tag}.sql`);
      const content = fs.readFileSync(sqlFile, "utf-8");
      const hash = crypto
        .createHash("sha256")
        .update(content)
        .digest("hex");

      await db.execute(
        sql`INSERT INTO \`__drizzle_migrations\` (hash, created_at) VALUES (${hash}, ${entry0002.when})`,
      );
      console.log("  ✓ Seeded journal with migration 0002 (already applied)");
    }
  }

  console.log("✅ Migration journal bootstrapped successfully");
}

async function tableExists(db: Database, tableName: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ${tableName}`,
  );
  const rows = result[0] as unknown as Array<{ cnt: number | bigint }>;
  return Number(rows[0]?.cnt) > 0;
}

async function columnExists(
  db: Database,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ${tableName} AND column_name = ${columnName}`,
  );
  const rows = result[0] as unknown as Array<{ cnt: number | bigint }>;
  return Number(rows[0]?.cnt) > 0;
}
