import fs from "fs";
import mysql from "mysql2/promise";
import "dotenv/config";

const files = process.argv.slice(2);

// Validate required environment variables
const requiredEnvVars = ["RAGAS_DB_HOST", "RAGAS_DB_PASSWORD", "RAGAS_DB_NAME"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(
    `❌ Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
  console.error(
    "💡 Please set these environment variables before running the script.",
  );
  process.exit(1);
}

if (files.length === 0) {
  console.error("❌ No result files provided");
  console.error("Usage: node insert_publisher_metrics_to_db.js <result-file.json>");
  process.exit(1);
}

for (const file of files) {
  let testResults;

  try {
    const raw = fs.readFileSync(file, "utf8");
    testResults = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to read or parse ${file}:`, err.message);
    continue;
  }

  let db;
  try {
    db = await mysql.createConnection({
      host: process.env.RAGAS_DB_HOST,
      user: process.env.RAGAS_DB_USER || process.env.RAGAS_DB_NAME || "root",
      password: process.env.RAGAS_DB_PASSWORD,
      database: process.env.RAGAS_DB_NAME,
      port: 3306,
    });
  } catch (err) {
    console.error("❌ Failed to connect to database:", err.message);
    continue;
  }

  try {
    // Use current timestamp if not provided in the results
    // Convert to MySQL datetime format (YYYY-MM-DD HH:MM:SS)
    const timestamp = testResults.timestamp 
      ? new Date(testResults.timestamp).toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
      : new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    const blockchain = testResults.blockchain || 'otp:20430';

    // Calculate success rate as percentage (0-100)
    const successRate = testResults.published && testResults.totalAssets 
      ? Math.round((testResults.published / testResults.totalAssets) * 100 * 100) / 100
      : 0;

    // Average publish time in seconds
    const avgPublishTime = testResults.avgPublishTime || 0;

    // Insert into publisher_test table
    const metricsQuery = `
      INSERT INTO publisher_test (
        timestamp,
        blockchain,
        publish_success_rate,
        avg_publish_time
      ) VALUES (?, ?, ?, ?)
    `;

    await db.execute(metricsQuery, [
      timestamp,
      blockchain,
      successRate,
      avgPublishTime,
    ]);

    console.log(`✅ Inserted publisher metrics into 'publisher_test' table`);
    console.log(`   Timestamp: ${timestamp}`);
    console.log(`   Blockchain: ${blockchain}`);
    console.log(`   Success Rate: ${successRate}%`);
    console.log(`   Avg Publish Time: ${avgPublishTime}s`);

    // Insert errors into publisher_test_errors table
    if (testResults.errors && Array.isArray(testResults.errors) && testResults.errors.length > 0) {
      const errorQuery = `
        INSERT INTO publisher_test_errors (
          timestamp,
          blockchain,
          error
        ) VALUES (?, ?, ?)
      `;

      for (const error of testResults.errors) {
        try {
          await db.execute(errorQuery, [
            timestamp,
            blockchain,
            error.message || error.toString(),
          ]);
        } catch (err) {
          console.error(`⚠️  Failed to insert error: ${err.message}`);
        }
      }

      console.log(`✅ Inserted ${testResults.errors.length} error(s) into 'publisher_test_errors' table`);
    } else {
      console.log(`ℹ️  No errors to insert`);
    }

  } catch (err) {
    console.error(
      `❌ Failed to insert into database:`,
      err.message,
    );
  }

  try {
    await db.end();
  } catch (err) {
    console.error("❌ Failed to close DB connection:", err.message);
  }
}

console.log("\n✅ Publisher metrics insertion complete!");
