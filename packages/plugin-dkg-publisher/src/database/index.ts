import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { migrate } from "drizzle-orm/mysql2/migrator";
import * as schema from "./schema";
import path from "path";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString: string) {
  const pool = mysql.createPool(connectionString);
  return drizzle(pool, { schema, mode: "default" });
}

export async function runMigrations(connectionString: string) {
  // Use a dedicated single connection (not the pool) for migration isolation.
  const connection = await mysql.createConnection(connectionString);
  try {
    await migrate(drizzle(connection), {
      migrationsFolder: path.join(__dirname, "../src/database/migrations"),
    });
  } finally {
    await connection.end();
  }
}

export * from "./schema";
