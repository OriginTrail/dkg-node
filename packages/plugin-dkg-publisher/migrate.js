#!/usr/bin/env node

/**
 * Database migration script for DKG Publisher Plugin
 *
 * NOTE: Migrations now run automatically on plugin startup (see services/index.ts).
 * This script is provided for manual/debug use only.
 */

const { drizzle } = require("drizzle-orm/mysql2");
const { migrate } = require("drizzle-orm/mysql2/migrator");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config({ path: ".env.publisher" });
dotenv.config(); // Also load from .env if present

async function runMigrations() {
  console.log("🚀 Starting database migrations...");

  // Get database URL from environment
  const databaseUrl = process.env.DKGP_DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DKGP_DATABASE_URL not found in environment variables");
    console.log("Make sure you have run the setup script: npm run setup");
    process.exit(1);
  }

  console.log("📊 Connecting to database...");

  let connection;
  try {
    // Create connection
    connection = mysql.createPool(databaseUrl);

    // Create Drizzle instance
    const db = drizzle(connection);

    // Run migrations
    console.log("🔧 Running migrations...");
    await migrate(db, {
      migrationsFolder: path.join(__dirname, "src/database/migrations"),
    });

    console.log("✅ Migrations completed successfully!");

    // Verify tables were created
    const [tables] = await connection.execute("SHOW TABLES");
    console.log(
      `📋 Created ${tables.length} tables:`,
      tables.map((t) => Object.values(t)[0]).join(", "),
    );
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔌 Database connection closed");
    }
  }
}

// Run migrations
runMigrations();
