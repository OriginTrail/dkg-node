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

// Determine table name based on source (default to dkg_node)
const source = process.env.RAGAS_SOURCE || "dkg_node";
if (!["guardian", "dkg_node", "azerfit", "pharmagenesis"].includes(source)) {
  console.error(
    `❌ Invalid RAGAS_SOURCE: ${source}. Must be 'guardian', 'dkg_node', 'azerfit', or 'pharmagenesis'`,
  );
  process.exit(1);
}
const tableName = `ragas_${source}`;

for (const file of files) {
  let ragasResults;

  try {
    const raw = fs.readFileSync(file, "utf8");
    ragasResults = JSON.parse(raw);
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
    const query = `
            INSERT INTO ${tableName} (
                timestamp,
                overall_score,
                context_precision,
                context_recall,
                context_relevancy,
                answer_relevance,
                faithfulness,
                answer_similarity,
                answer_correctness
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

    // Use current timestamp if not provided in the results
    // Convert to MySQL datetime format (YYYY-MM-DD HH:MM:SS)
    const timestamp = ragasResults.timestamp 
      ? new Date(ragasResults.timestamp).toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
      : new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    // Convert all scores to percentages (multiply by 100)
    // Handle null/undefined values by defaulting to 0
    const convertToPercentage = (value) => {
      if (value === null || value === undefined || isNaN(value)) {
        return 0;
      }
      return Math.round(value * 100 * 100) / 100; // Round to 2 decimal places
    };

    await db.execute(query, [
      timestamp,
      convertToPercentage(ragasResults.overall_score),
      convertToPercentage(ragasResults.context_precision),
      convertToPercentage(ragasResults.context_recall),
      convertToPercentage(ragasResults.context_relevancy),
      convertToPercentage(ragasResults.answer_relevance),
      convertToPercentage(ragasResults.faithfulness),
      convertToPercentage(ragasResults.answer_similarity),
      convertToPercentage(ragasResults.answer_correctness),
    ]);

    console.log(`✅ Inserted results into table '${tableName}'`);
  } catch (err) {
    console.error(
      `❌ Failed to insert into DB (table '${tableName}'):`,
      err.message,
    );
  }

  try {
    await db.end();
  } catch (err) {
    console.error("❌ Failed to close DB connection:", err.message);
  }
}
