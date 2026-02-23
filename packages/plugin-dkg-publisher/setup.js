#!/usr/bin/env node

/**
 * DKG Publisher Plugin Setup Script
 *
 * This script configures the DKG Publisher plugin for any DKG-Node project.
 * It handles database creation, migrations, wallet setup, and environment configuration.
 */

const fs = require("fs").promises;
const path = require("path");
const readline = require("readline");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");
const { Wallet } = require("ethers");

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(message, color = "reset") {
  const colorCode = colors[color] || colors.reset;
  console.log(`${colorCode}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(
    `\n${colors.bold}[${step}]${colors.reset} ${colors.cyan}${message}${colors.reset}`,
  );
}

// Interactive input helper
function ask(question, options = {}) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const prompt = options.password
      ? question.replace(/:/g, " (input hidden):")
      : question;

    // Mute output for password fields so typed characters are not echoed
    if (options.password) {
      rl._writeToOutput = (str) => {
        // Only suppress characters after the prompt has been written
        if (str === prompt || str.includes(prompt)) {
          process.stdout.write(str);
        }
      };
    }

    rl.question(`${colors.yellow}${prompt}${colors.reset} `, (answer) => {
      if (options.password) {
        // Print a newline since the user's Enter was not echoed
        process.stdout.write("\n");
      }
      rl.close();

      // Handle empty input - use default if available
      const finalAnswer = answer.trim() || options.default || "";

      // Handle required fields
      if (options.required && !finalAnswer) {
        log("This field is required!", "red");
        return resolve(ask(question, options));
      }

      // Handle validation
      if (options.validate && !options.validate(finalAnswer)) {
        log(options.error || "Invalid input!", "red");
        return resolve(ask(question, options));
      }

      resolve(finalAnswer);
    });
  });
}

// Create file with content (won't overwrite existing)
async function createFile(filePath, content, overwrite = false) {
  try {
    if (!overwrite) {
      try {
        await fs.access(filePath);
        log(
          `File ${path.basename(filePath)} already exists, skipping...`,
          "yellow",
        );
        return false;
      } catch {
        // File doesn't exist, continue
      }
    }

    await fs.writeFile(filePath, content, "utf8");
    log(`Created ${path.basename(filePath)}`, "green");
    return true;
  } catch (error) {
    log(`Error creating ${path.basename(filePath)}: ${error.message}`, "red");
    return false;
  }
}

// Generate secure random key
function generateSecretKey(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

// Encrypt wallet private key using AES (same method as runtime)
function encryptPrivateKey(privateKey, encryptionKey) {
  return CryptoJS.AES.encrypt(privateKey, encryptionKey).toString();
}

// Validate Ethereum address
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Validate private key
function isValidPrivateKey(key) {
  return /^0x[a-fA-F0-9]{64}$/.test(key) || /^[a-fA-F0-9]{64}$/.test(key);
}

// Derive wallet address from private key
function getAddressFromPrivateKey(privateKey) {
  try {
    // Ensure private key has 0x prefix
    const formattedKey = privateKey.startsWith("0x")
      ? privateKey
      : `0x${privateKey}`;
    const wallet = new Wallet(formattedKey);
    return wallet.address;
  } catch (error) {
    throw new Error(`Invalid private key: ${error.message}`);
  }
}

// Bootstrap migration journal for databases created by a previous version of
// setup.js (raw DDL, no __drizzle_migrations table). Without this, migrate()
// would try to re-run CREATE TABLE statements on existing tables and fail.
// This mirrors the logic in src/database/bootstrap.ts but uses raw mysql2 queries.
async function bootstrapJournalForSetup(pool) {
  const fsSync = require("fs");

  const [journals] = await pool.execute(
    `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '__drizzle_migrations'`,
  );
  if (Number(journals[0].cnt) > 0) return;

  const [tables] = await pool.execute(
    `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('assets', 'wallets', 'publishing_attempts', 'batches')`,
  );
  const tableCount = Number(tables[0].cnt);
  if (tableCount === 0) return; // Fresh DB

  if (tableCount < 4) {
    throw new Error(
      "Database is in a partial state (some tables missing). Please choose 'Start fresh' (option 2).",
    );
  }

  log("  Bootstrapping migration journal for existing database...", "cyan");

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const journalPath = path.join(
    __dirname,
    "src/database/migrations/meta/_journal.json",
  );
  const journal = JSON.parse(fsSync.readFileSync(journalPath, "utf-8"));

  // Seed 0000 and 0001 (setup.js schema = post-0001 state)
  for (const entry of journal.entries) {
    if (entry.idx > 1) break;
    const sqlFile = path.join(
      __dirname,
      `src/database/migrations/${entry.tag}.sql`,
    );
    const content = fsSync.readFileSync(sqlFile, "utf-8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    await pool.execute(
      `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
      [hash, entry.when],
    );
  }

  // Check if 0002 changes are already present
  const entry0002 = journal.entries.find((e) => e.idx === 2);
  if (entry0002) {
    const [hasErrorDetails] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'publishing_attempts' AND column_name = 'error_details'`,
    );
    const [hasPrivateKey] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'wallets' AND column_name = 'private_key'`,
    );
    if (
      Number(hasErrorDetails[0].cnt) > 0 &&
      Number(hasPrivateKey[0].cnt) > 0
    ) {
      const sqlFile = path.join(
        __dirname,
        `src/database/migrations/${entry0002.tag}.sql`,
      );
      const content = fsSync.readFileSync(sqlFile, "utf-8");
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      await pool.execute(
        `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
        [hash, entry0002.when],
      );
    }
  }

  log("  ✓ Migration journal bootstrapped", "green");
}

// Check if configuration already exists
async function checkExistingConfig() {
  const existingEnv = ".env.publisher";
  const existingCompose = "docker-compose.knowledge-manager.yml";

  let hasConfig = false;
  let configDetails = {
    env: false,
    compose: false,
    database: null,
    redis: null,
  };

  try {
    await fs.access(existingEnv);
    configDetails.env = true;
    hasConfig = true;

    // Parse existing env
    const envContent = await fs.readFile(existingEnv, "utf8");
    const dbMatch = envContent.match(
      /DKGP_DATABASE_URL=mysql:\/\/([^:]+):?([^@]*)@([^:]+):(\d+)\/(\w+)/,
    );
    const redisMatch = envContent.match(
      /REDIS_URL=redis:\/\/(?:([^@]+)@)?([^:]+):(\d+)/,
    );

    if (dbMatch) {
      configDetails.database = {
        user: dbMatch[1],
        password: dbMatch[2] || "",
        host: dbMatch[3],
        port: dbMatch[4],
        name: dbMatch[5],
      };
    }

    if (redisMatch) {
      configDetails.redis = {
        password: redisMatch[1] || "",
        host: redisMatch[2],
        port: redisMatch[3],
      };
    }
  } catch {}

  try {
    await fs.access(existingCompose);
    configDetails.compose = true;
    hasConfig = true;
  } catch {}

  return { hasConfig, configDetails };
}

// Add wallets only mode
async function addWalletsOnly(configDetails) {
  if (!configDetails.database) {
    log(
      "❌ No database configuration found. Please run full setup first.",
      "red",
    );
    return;
  }

  // Read encryption key from existing .env file
  let encryptionKey;
  try {
    const envContent = await fs.readFile(".env.publisher", "utf8");
    const keyMatch = envContent.match(/ENCRYPTION_KEY=(.+)/);
    if (!keyMatch) {
      log("❌ ENCRYPTION_KEY not found in .env.publisher", "red");
      return;
    }
    encryptionKey = keyMatch[1];
    log("✓ Found encryption key", "green");
  } catch (error) {
    log("❌ Could not read .env.publisher file", "red");
    return;
  }

  logStep("1/2", "Connect to Database");

  const { database } = configDetails;
  let connection;

  try {
    connection = await mysql.createConnection({
      host: database.host,
      port: parseInt(database.port),
      user: database.user,
      password: database.password,
      database: database.name,
    });

    log("✓ Connected to existing database", "green");

    // Check existing wallets
    const [existingWallets] = await connection.execute(
      "SELECT address, blockchain FROM wallets WHERE is_active = TRUE",
    );

    if (existingWallets.length > 0) {
      log(`\n📋 Found ${existingWallets.length} existing wallet(s):`, "cyan");
      existingWallets.forEach((wallet, index) => {
        log(
          `  ${index + 1}. ${wallet.address} (${wallet.blockchain})`,
          "white",
        );
      });
    }

    logStep("2/2", "Add New Wallets");

    const wallets = [];
    let addMoreWallets = true;
    let walletCount = existingWallets.length + 1;

    while (addMoreWallets) {
      log(`${colors.bold}Wallet ${walletCount}:${colors.reset}`);

      const privateKey = await ask(`Private Key (0x... or without 0x):`, {
        required: true,
        validate: isValidPrivateKey,
        error: "Invalid private key format",
      });

      // Ensure private key has 0x prefix
      const formattedPrivateKey = privateKey.startsWith("0x")
        ? privateKey
        : `0x${privateKey}`;

      // Derive address from private key
      let address;
      try {
        address = getAddressFromPrivateKey(formattedPrivateKey);
        log(`  ↳ Derived address: ${address}`, "cyan");
      } catch (error) {
        log(`❌ ${error.message}`, "red");
        continue;
      }

      // Check if wallet already exists
      const [duplicate] = await connection.execute(
        "SELECT id FROM wallets WHERE address = ?",
        [address],
      );
      if (duplicate.length > 0) {
        log(`⚠️  Wallet ${address} already exists, skipping...`, "yellow");
        const addMore = await ask(`Add another wallet? (y/N):`, {
          default: "n",
        });
        addMoreWallets =
          addMore.toLowerCase() === "y" || addMore.toLowerCase() === "yes";
        continue;
      }

      const blockchain = await ask(
        `Blockchain (default: ${existingWallets[0]?.blockchain || "otp:20430"}):`,
        {
          default: existingWallets[0]?.blockchain || "otp:20430",
        },
      );

      wallets.push({
        address,
        privateKey: formattedPrivateKey,
        blockchain,
      });

      log(`✓ Wallet ${walletCount} added`, "green");

      const addMore = await ask(`Add another wallet? (y/N):`, { default: "n" });
      addMoreWallets =
        addMore.toLowerCase() === "y" || addMore.toLowerCase() === "yes";
      walletCount++;
    }

    // Insert new wallets
    for (const wallet of wallets) {
      await connection.execute(
        `INSERT INTO wallets (address, private_key, blockchain) VALUES (?, ?, ?)`,
        [wallet.address, wallet.privateKey, wallet.blockchain],
      );
    }

    log(`\n✅ Added ${wallets.length} new wallet(s) to database`, "green");
    log(`📋 Total wallets: ${existingWallets.length + wallets.length}`, "cyan");
  } catch (error) {
    log(`Database error: ${error.message}`, "red");
  } finally {
    if (connection) await connection.end();
  }
}

// Main setup function
async function setup() {
  log(
    `${colors.bold}${colors.blue}╔══════════════════════════════════════════════════════════════╗${colors.reset}`,
  );
  log(
    `${colors.bold}${colors.blue}║                DKG Publisher Plugin Setup                   ║${colors.reset}`,
  );
  log(
    `${colors.bold}${colors.blue}║                                                              ║${colors.reset}`,
  );
  log(
    `${colors.bold}${colors.blue}║  This script will configure the DKG Publisher plugin       ║${colors.reset}`,
  );
  log(
    `${colors.bold}${colors.blue}║  for publishing JSON-LD assets to the DKG blockchain.       ║${colors.reset}`,
  );
  log(
    `${colors.bold}${colors.blue}╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`,
  );

  try {
    // Check for existing configuration
    const { hasConfig, configDetails } = await checkExistingConfig();

    let setupMode;

    if (hasConfig) {
      log("🔍 Existing configuration detected:", "yellow");
      if (configDetails.env) log("  • .env.publisher found", "cyan");
      if (configDetails.compose)
        log("  • docker-compose.knowledge-manager.yml found", "cyan");

      setupMode = await ask(
        "\nChoose setup mode:\n1. Update existing configuration\n2. Start fresh (will backup existing files)\n3. Add wallets only\nChoice (1-3):",
        {
          validate: (input) => ["1", "2", "3"].includes(input),
          error: "Please enter 1, 2, or 3",
        },
      );

      if (setupMode === "2") {
        // Backup existing files
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        try {
          await fs.rename(
            ".env.publisher",
            `.env.publisher.backup-${timestamp}`,
          );
          log("✓ Backed up existing .env file", "green");
        } catch {}
        try {
          await fs.rename(
            "docker-compose.knowledge-manager.yml",
            `docker-compose.knowledge-manager.yml.backup-${timestamp}`,
          );
          log("✓ Backed up existing docker-compose file", "green");
        } catch {}
      } else if (setupMode === "3") {
        // Wallets-only mode
        return await addWalletsOnly(configDetails);
      }
    }

    // Use existing configuration as defaults if available
    const existingDb = configDetails.database;
    const existingRedis = configDetails.redis;

    // Step 1: Database Configuration
    logStep("1/7", "Database Configuration");

    const dbHost = await ask(
      `MySQL Host (default: ${existingDb?.host || "localhost"}):`,
      { default: existingDb?.host || "localhost" },
    );
    const dbPort = await ask(
      `MySQL Port (default: ${existingDb?.port || "3306"}):`,
      { default: existingDb?.port || "3306" },
    );
    const dbUser = await ask(
      `MySQL Username (default: ${existingDb?.user || "root"}):`,
      { default: existingDb?.user || "root" },
    );
    const dbPassword = await ask("MySQL Password:", {
      password: true,
      default: existingDb?.password || "",
    });
    const dbName = await ask(
      `Database Name (default: ${existingDb?.name || "dkg_publisher_db"}):`,
      { default: existingDb?.name || "dkg_publisher_db" },
    );

    // Step 2: Redis Configuration
    logStep("2/7", "Redis Configuration");

    const redisHost = await ask(
      `Redis Host (default: ${existingRedis?.host || "localhost"}):`,
      { default: existingRedis?.host || "localhost" },
    );
    const redisPort = await ask(
      `Redis Port (default: ${existingRedis?.port || "6379"}):`,
      { default: existingRedis?.port || "6379" },
    );
    const redisPassword = await ask("Redis Password (leave empty if none):", {
      default: existingRedis?.password || "",
    });

    // Step 3: DKG Configuration
    logStep("3/7", "DKG Network Configuration");

    const dkgEndpoint = await ask(
      "DKG Engine URL (default: http://localhost:8900):",
      {
        default: "http://localhost:8900",
      },
    );

    const blockchainOptions = [
      "hardhat1:31337 (Local Development)",
      "gnosis:100 (Gnosis Mainnet)",
      "gnosis:10200 (Gnosis Testnet)",
      "base:8453 (Base Mainnet)",
      "base:84532 (Base Testnet)",
      "otp:20430 (NeuroWeb Testnet)",
      "otp:2043 (NeuroWeb Mainnet)",
      "custom (Enter manually)",
    ];

    log("\nAvailable blockchain networks:");
    blockchainOptions.forEach((option, index) => {
      log(`${index + 1}. ${option}`, "cyan");
    });

    const blockchainChoice = await ask("Choose blockchain (1-8):", {
      validate: (input) =>
        ["1", "2", "3", "4", "5", "6", "7", "8"].includes(input),
      error: "Please enter 1, 2, 3, 4, 5, 6, 7, or 8",
    });

    let blockchain;
    switch (blockchainChoice) {
      case "1":
        blockchain = "hardhat1:31337";
        break;
      case "2":
        blockchain = "gnosis:100";
        break;
      case "3":
        blockchain = "gnosis:10200";
        break;
      case "4":
        blockchain = "base:8453";
        break;
      case "5":
        blockchain = "base:84532";
        break;
      case "6":
        blockchain = "otp:20430";
        break;
      case "7":
        blockchain = "otp:2043";
        break;
      case "8":
        blockchain = await ask("Enter blockchain (format: name:chainId):", {
          required: true,
          validate: (input) => input.includes(":"),
          error: "Format must be name:chainId (e.g., gnosis:100)",
        });
        break;
    }

    if (!blockchain) {
      log("❌ Blockchain selection failed", "red");
      throw new Error("Invalid blockchain selection");
    }

    // Step 4: Wallet Configuration
    logStep("4/7", "Wallet Pool Setup");

    log(
      "The DKG Publisher plugin requires at least one wallet for publishing.",
    );
    log(
      "For high throughput, configure multiple wallets (10-100+ recommended).\n",
    );

    const wallets = [];
    let addMoreWallets = true;
    let walletCount = 1;

    while (addMoreWallets) {
      log(`${colors.bold}Wallet ${walletCount}:${colors.reset}`);

      const privateKey = await ask(`Private Key (0x... or without 0x):`, {
        required: true,
        validate: isValidPrivateKey,
        error: "Invalid private key format",
      });

      // Ensure private key has 0x prefix
      const formattedPrivateKey = privateKey.startsWith("0x")
        ? privateKey
        : `0x${privateKey}`;

      // Derive address from private key
      let address;
      try {
        address = getAddressFromPrivateKey(formattedPrivateKey);
        log(`  ↳ Derived address: ${address}`, "cyan");
      } catch (error) {
        log(`❌ ${error.message}`, "red");
        continue;
      }

      wallets.push({
        address,
        privateKey: formattedPrivateKey,
        blockchain,
      });

      log(`✓ Wallet ${walletCount} added`, "green");

      const addMore = await ask(`Add another wallet? (y/N):`, { default: "n" });
      addMoreWallets =
        addMore.toLowerCase() === "y" || addMore.toLowerCase() === "yes";
      walletCount++;
    }

    // Step 5: Storage Configuration
    logStep("5/7", "File Storage Configuration");

    const storageType = await ask(
      "Storage type (filesystem/s3) [default: filesystem]:",
      {
        default: "filesystem",
        validate: (input) => ["filesystem", "s3"].includes(input.toLowerCase()),
        error: 'Please enter "filesystem" or "s3"',
      },
    );

    let storageConfig = { type: storageType.toLowerCase() };

    if (storageConfig.type === "filesystem") {
      const storagePath = await ask("Storage directory (default: ./storage):", {
        default: "./storage",
      });
      storageConfig.path = storagePath;
    } else {
      const s3Bucket = await ask("S3 Bucket name:", { required: true });
      const s3Region = await ask("S3 Region (default: us-east-1):", {
        default: "us-east-1",
      });
      const s3AccessKey = await ask("AWS Access Key ID:", { required: true });
      const s3SecretKey = await ask("AWS Secret Access Key:", {
        password: true,
        required: true,
      });

      storageConfig = {
        type: "s3",
        bucket: s3Bucket,
        region: s3Region,
        accessKeyId: s3AccessKey,
        secretAccessKey: s3SecretKey,
      };
    }

    // Step 6: Worker Configuration
    logStep("6/7", "Worker Pool Configuration");

    log("Configure worker processes for optimal throughput:");
    log(
      `With ${wallets.length} wallet(s), recommended workers: ${Math.min(Math.ceil(wallets.length / 10), 10)}`,
    );
    log(
      "Note: Worker concurrency is now auto-calculated based on wallet count.",
    );

    const workerCount = await ask(
      `Number of worker processes (default: ${Math.min(Math.ceil(wallets.length / 10), 5)}):`,
      {
        default: Math.min(Math.ceil(wallets.length / 10), 5).toString(),
        validate: (input) => !isNaN(parseInt(input)) && parseInt(input) > 0,
        error: "Please enter a positive number",
      },
    );

    // Step 7: Create Configuration Files
    logStep("6/7", "Creating Configuration Files");

    // Generate security keys once for reuse
    const encryptionKey = generateSecretKey();
    const jwtSecret = generateSecretKey();

    // Environment file
    const envContent = `# DKG Publisher Plugin Configuration
# Generated by setup script on ${new Date().toISOString()}

# Database Configuration
DKGP_DATABASE_URL=mysql://${dbUser}${dbPassword ? ":" + dbPassword : ""}@${dbHost}:${dbPort}/${dbName}

# Redis Configuration  
REDIS_URL=redis://${redisPassword ? `${redisPassword}@` : ""}${redisHost}:${redisPort}

# DKG Network Configuration
DKG_ENDPOINT=${dkgEndpoint}
DKG_BLOCKCHAIN=${blockchain}

# File Storage Configuration
STORAGE_TYPE=${storageConfig.type}
${
  storageConfig.type === "filesystem"
    ? ``
    : `AWS_S3_BUCKET=${storageConfig.bucket}
AWS_S3_REGION=${storageConfig.region}
AWS_ACCESS_KEY_ID=${storageConfig.accessKeyId}
AWS_SECRET_ACCESS_KEY=${storageConfig.secretAccessKey}`
}

# Worker Configuration
WORKER_COUNT=${workerCount}
# Note: WORKER_CONCURRENCY is auto-calculated from wallet count (no need to set manually)

# Security
ENCRYPTION_KEY=${encryptionKey}
JWT_SECRET=${jwtSecret}

# Monitoring (optional)
# SENTRY_DSN=
# DATADOG_API_KEY=
`;

    const overwriteConfig = setupMode === "1" || setupMode === "2";
    await createFile(".env.publisher", envContent, overwriteConfig);

    // Skip wallet configuration file - wallets will be inserted directly into database

    // Docker compose file
    const dockerComposeContent = `version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${dbPassword}
      MYSQL_DATABASE: ${dbName}
      MYSQL_USER: km_user
      MYSQL_PASSWORD: ${generateSecretKey(16)}
    ports:
      - "${dbPort}:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./migrations:/docker-entrypoint-initdb.d
    command: >
      --default-authentication-plugin=mysql_native_password
      --innodb-lock-wait-timeout=10
      --max-connections=200

  redis:
    image: redis:7-alpine
    ports:
      - "${redisPort}:6379"
    volumes:
      - redis_data:/data
    ${redisPassword ? `command: redis-server --requirepass ${redisPassword}` : ""}

  knowledge-manager:
    image: dkg-knowledge-manager:latest
    env_file:
      - .env.publisher
    depends_on:
      - mysql
      - redis
    scale: ${workerCount}
    volumes:
      ${storageConfig.type === "filesystem" ? `- ./storage:/app/storage` : ""}

volumes:
  mysql_data:
  redis_data:
`;

    await createFile(
      "docker-compose.knowledge-manager.yml",
      dockerComposeContent,
      overwriteConfig,
    );

    // Package.json scripts
    const packageJsonAddition = {
      scripts: {
        "km:setup": "node setup.js",
        "km:migrate": "npm run db:migrate",
        "km:worker": "npm run worker",
        "km:dashboard": "npm run dashboard",
        "km:status":
          "node -e \"console.log('Use the /api/knowledge/health endpoint for status')\"",
        "km:docker:up":
          "docker-compose -f docker-compose.knowledge-manager.yml up -d",
        "km:docker:down":
          "docker-compose -f docker-compose.knowledge-manager.yml down",
      },
      dependencies: {
        "@dkg/plugin-dkg-publisher": "^1.0.0",
        bullmq: "^4.15.0",
        ioredis: "^5.3.2",
        mysql2: "^3.6.5",
        "drizzle-orm": "^0.29.0",
      },
    };

    await createFile(
      "package-addition.json",
      JSON.stringify(packageJsonAddition, null, 2),
    );

    // Create storage directory if filesystem
    if (storageConfig.type === "filesystem") {
      try {
        await fs.mkdir(path.resolve(storageConfig.path), { recursive: true });
        log(`Created storage directory: ${storageConfig.path}`, "green");
      } catch (error) {
        log(
          `Warning: Could not create storage directory: ${error.message}`,
          "yellow",
        );
      }
    }

    // Database setup
    logStep("7/7", "Database Setup");
    log("Setting up database and creating tables...");
    let connection;
    try {
      // Connect to MySQL without database first
      log(`Connecting to MySQL at ${dbHost}:${dbPort}...`);
      connection = await mysql.createConnection({
        host: dbHost,
        port: parseInt(dbPort),
        user: dbUser,
        password: dbPassword,
      });

      log("✓ Connected to MySQL server", "green");

      // Create database if it doesn't exist
      await connection.execute(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      log(`✓ Database '${dbName}' created/verified`, "green");

      // Switch to the database
      await connection.changeUser({ database: dbName });
      log(`✓ Connected to database '${dbName}'`, "green");

      // Run Drizzle migrations to create/update tables
      log("Running database migrations...", "cyan");

      // Check if this is a fresh start (Mode 2) — drop all tables first
      if (setupMode === "2" || !hasConfig) {
        log("  Dropping existing tables for fresh setup...", "white");
        await connection.execute("SET FOREIGN_KEY_CHECKS = 0");
        await connection.execute("DROP TABLE IF EXISTS __drizzle_migrations");
        await connection.execute("DROP TABLE IF EXISTS wallet_metrics");
        await connection.execute("DROP TABLE IF EXISTS publishing_attempts");
        await connection.execute("DROP TABLE IF EXISTS assets");
        await connection.execute("DROP TABLE IF EXISTS wallets");
        await connection.execute("DROP TABLE IF EXISTS batches");
        await connection.execute("DROP TABLE IF EXISTS metrics_hourly");
        await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
      }

      // Close the single connection — Drizzle needs a pool
      await connection.end();
      connection = null;

      // Run Drizzle migrations via a dedicated connection with FK checks disabled.
      // Migration 0001 changes column types that have FK references, and MySQL
      // validates FK compatibility on each ALTER TABLE.
      const { drizzle } = require("drizzle-orm/mysql2");
      const { migrate } = require("drizzle-orm/mysql2/migrator");
      const migrationConn = await mysql.createConnection({
        host: dbHost,
        port: parseInt(dbPort),
        user: dbUser,
        password: dbPassword,
        database: dbName,
      });
      try {
        // Bootstrap migration journal for existing databases without one
        // (e.g. created by a previous version of setup.js with raw DDL)
        await bootstrapJournalForSetup(migrationConn);

        await migrate(drizzle(migrationConn), {
          migrationsFolder: path.join(__dirname, "src/database/migrations"),
        });
      } finally {
        await migrationConn.end();
      }
      log("✓ Database migrations completed", "green");

      // Reconnect with single connection for wallet insertion
      connection = await mysql.createConnection({
        host: dbHost,
        port: parseInt(dbPort),
        user: dbUser,
        password: dbPassword,
        database: dbName,
      });

      // Verify tables were created
      const [tables] = await connection.execute("SHOW TABLES");
      const tableNames = tables.map((row) => Object.values(row)[0]);
      log(
        `✓ Created ${tableNames.length} tables: ${tableNames.join(", ")}`,
        "green",
      );

      // Insert wallet configurations
      if (wallets.length > 0) {
        log(`Inserting ${wallets.length} wallet(s)...`, "cyan");
        log(
          `Debug: Wallet addresses to insert: ${wallets.map((w) => w.address).join(", ")}`,
          "yellow",
        );
        let insertedCount = 0;

        for (let i = 0; i < wallets.length; i++) {
          const wallet = wallets[i];
          try {
            log(
              `  Processing wallet ${i + 1}/${wallets.length}: ${wallet.address}`,
              "cyan",
            );

            // Check if wallet already exists first
            const [existing] = await connection.execute(
              `SELECT id FROM wallets WHERE address = ?`,
              [wallet.address],
            );

            if (existing.length > 0) {
              log(
                `  - Wallet ${wallet.address} already exists (ID: ${existing[0].id}), skipped`,
                "yellow",
              );
              continue;
            }

            // Store private key as plain text (simplified approach)
            const privateKey = wallet.privateKey;

            const [result] = await connection.execute(
              `INSERT INTO wallets (address, private_key, blockchain) VALUES (?, ?, ?)`,
              [wallet.address, privateKey, wallet.blockchain],
            );

            insertedCount++;
            log(
              `  ✓ Wallet ${wallet.address} inserted (ID: ${result.insertId})`,
              "green",
            );
          } catch (walletError) {
            log(
              `  ❌ Failed to insert wallet ${wallet.address}: ${walletError.message}`,
              "red",
            );
          }
        }

        log(
          `✓ ${insertedCount} wallet(s) successfully configured in database`,
          "green",
        );

        // Verify wallets were inserted
        const [walletCount] = await connection.execute(
          "SELECT COUNT(*) as count FROM wallets WHERE is_active = TRUE",
        );
        log(
          `✓ Total active wallets in database: ${walletCount[0].count}`,
          "green",
        );
      } else {
        log(
          "⚠️  No wallets configured. You can add them later using setup script option 3.",
          "yellow",
        );
      }

      await connection.end();
      log("✓ Database connection closed", "green");
    } catch (error) {
      log(`\n❌ Database setup failed: ${error.message}`, "red");
      log("Possible causes:", "yellow");
      log("• MySQL server not running", "white");
      log("• Incorrect credentials", "white");
      log("• Network connection issues", "white");
      log("• Permission problems", "white");

      if (connection) {
        try {
          await connection.end();
        } catch (closeError) {
          // Ignore connection close errors
        }
      }

      throw error; // Re-throw to stop setup process
    }

    // Final success message
    log(
      `\n${colors.bold}${colors.green}╔══════════════════════════════════════════════════════════════╗${colors.reset}`,
    );
    log(
      `${colors.bold}${colors.green}║                    Setup Complete!                          ║${colors.reset}`,
    );
    log(
      `${colors.bold}${colors.green}╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`,
    );

    log("Configuration files created:", "green");
    log("  • .env.publisher (environment variables)", "cyan");
    log("  • docker-compose.knowledge-manager.yml (Docker setup)", "cyan");
    log("  • package-addition.json (npm scripts to add)", "cyan");

    log("\nNext steps:", "yellow");
    log(
      "The DKG Publisher plugin is now ready! Here's how to use it:",
      "white",
    );
    log("");
    log("✅ Already completed:", "green");
    log("  • Database created with tables", "white");
    log("  • Configuration files generated", "white");
    log("  • Wallets configured in database", "white");
    log("");
    log("🚀 To start using:", "blue");
    log("1. Make sure MySQL and Redis are running locally", "white");
    log("2. Configure DKG Agent to load this plugin", "white");
    log("3. The service will auto-start with configured workers", "white");
    log("4. Test API endpoints or use MCP tools", "white");
    log("");
    log("📋 Optional:", "cyan");
    log("• Add more wallets: npm run setup (choose option 3)", "white");
    log("  Workers will auto-restart to match new wallet count", "white");
    log("• View dashboard at: /admin/queues (when agent is running)", "white");
    log("• Check health: GET /api/knowledge/health", "white");

    log("\nExample usage in DKG Agent plugin:", "yellow");
    log(
      `// The DKG Publisher plugin runs as a DKG plugin
// and provides these API endpoints:

// Register asset for publishing
POST /api/knowledge/assets
{
  "content": { "@context": "https://schema.org", "@type": "Certificate" },
  "metadata": { "source": "my-app", "sourceId": "cert-123" },
  "publishOptions": { "privacy": "private", "priority": 80 }
}

// Get asset status
GET /api/knowledge/assets/{id}

// Get metrics
GET /api/knowledge/metrics/queue
GET /api/knowledge/metrics/wallets
GET /api/knowledge/health

// MCP Tool
knowledge-asset-publish`,
      "white",
    );

    log("\n⚠️  Security Notes:", "red");
    log("• Keep your DATABASE_URL and ENCRYPTION_KEY secure", "yellow");
    log("• Use environment variables for production deployments", "yellow");

    log(`\n${colors.bold}Happy publishing! 🚀${colors.reset}\n`);
  } catch (error) {
    log(`\nSetup failed: ${error.message}`, "red");
    console.error(error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  log("\nSetup cancelled by user.", "yellow");
  process.exit(0);
});

// Run setup if called directly
if (require.main === module) {
  setup();
}

module.exports = { setup };
