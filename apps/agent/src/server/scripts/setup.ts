import path from "path";
import prompts from "prompts";

import { getLLMProviderApiKeyEnvName, LLMProvider } from "@/shared/chat";
import { DEFAULT_SYSTEM_PROMPT } from "@/shared/prompts/defaultSystemPrompt";

import {
  configDatabase,
  configEnv,
  createFileWithContent,
  createUser,
  writeFileWithContent,
} from "../helpers";
import {
  buildPublisherDefaults,
  isValidMysqlIdentifier,
  resolveEngineMysqlPassword,
  provisionAsyncPublishing,
} from "../setupPublisher";

function formatEnvValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isValidPrivateKey(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

async function setup() {
  const enginePassword = await resolveEngineMysqlPassword();

  if (enginePassword.status === "found") {
    console.log(
      `Detected MySQL password from ${enginePassword.envPath}. Async publishing can reuse it.`,
    );
  } else if (enginePassword.status === "missing-file") {
    console.log(
      `Engine config not found at ${enginePassword.envPath}. Async publishing defaults will require advanced setup.`,
    );
  } else {
    console.log(
      `Engine config found at ${enginePassword.envPath}, but REPOSITORY_PASSWORD is missing.`,
    );
  }

  const asyncPublishingChoices =
    enginePassword.status === "found"
      ? [
          {
            title:
              "Yes (Recommended) - more seamless publishing and tracking",
            value: "recommended",
          },
          { title: "No", value: "disabled" },
          { title: "Yes, with advanced configuration", value: "advanced" },
        ]
      : [
          { title: "No (Recommended)", value: "disabled" },
          { title: "Yes, with advanced configuration", value: "advanced" },
        ];

  const response = await prompts([
    {
      type: "select",
      name: "llmProvider",
      message: "Choose an LLM provider",
      choices: Object.entries(LLMProvider).map(([title, value]) => ({
        title,
        value,
      })),
    },
    {
      type: "text",
      name: "llmApiKey",
      message: (prev) => `${getLLMProviderApiKeyEnvName(prev)}`,
    },
    {
      type: "text",
      name: "llmModel",
      message: "Model name",
      validate: (value) => value.length || "Model name is required",
    },
    {
      type: "number",
      name: "llmTemperature",
      message: "Temperature",
      initial: 1,
      min: 0,
      max: 1,
      float: true,
    },
    {
      type: "text",
      name: "llmSystemPrompt",
      message: "System prompt",
      initial: DEFAULT_SYSTEM_PROMPT,
      format: (value) => (value === DEFAULT_SYSTEM_PROMPT ? "" : value.trim()),
    },
    {
      type: "select",
      name: "docConversionProvider",
      message: "Document conversion provider",
      choices: [
        { title: "unpdf - basic PDF only", value: "unpdf" },
        { title: "Mistral OCR - complex PDF/DOCX/PPTX", value: "mistral" },
      ],
      initial: 0,
    },
    {
      type: (_, answers) =>
        answers.docConversionProvider === "mistral" &&
        answers.llmProvider !== "mistralai"
          ? "text"
          : null,
      name: "mistralApiKey",
      message: "MISTRAL_API_KEY",
      validate: (value) => value.length || "Required for Mistral OCR provider",
    },
    {
      type: "select",
      name: "dkgEnv",
      message: "DKG environment",
      choices: [
        { title: "Mainnet", value: "mainnet" },
        { title: "Testnet", value: "testnet" },
        { title: "Development", value: "development" },
      ],
    },
    {
      type: (_, answers) => (answers.dkgEnv === "development" ? "text" : "select"),
      name: "dkgBlockchain",
      message: "DKG blockchain",
      initial: (_, answers) =>
        answers.dkgEnv === "development" ? "hardhat1:31337" : "",
      choices: (previous) =>
        previous === "mainnet"
          ? [
              { title: "NeuroWeb", value: "otp:2043" },
              { title: "Base", value: "base:8453" },
              { title: "Gnosis", value: "gnosis:100" },
            ]
          : [
              { title: "NeuroWeb Testnet", value: "otp:20430" },
              { title: "Base Sepolia", value: "base:84532" },
              { title: "Gnosis Chiado", value: "gnosis:10200" },
            ],
    },
    {
      type: "text",
      name: "dkgPublishWallet",
      message: "Publish wallet private key",
      initial: (_, answers) =>
        answers.dkgEnv === "development"
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : "",
      validate: (value) => {
        if (!value.length) return "Required";
        return (
          isValidPrivateKey(value) ||
          "Private key must be a 0x-prefixed 32-byte hex string"
        );
      },
    },
    {
      type: "select",
      name: "asyncPublishingMode",
      message:
        "Enable async publishing for more seamless publishing and tracking of published knowledge assets?",
      choices: asyncPublishingChoices,
      initial: 0,
    },
    {
      type: (_, answers) =>
        answers.asyncPublishingMode === "advanced" &&
        enginePassword.status !== "found"
          ? "password"
          : null,
      name: "mysqlPassword",
      message: "MYSQL_PASSWORD",
      validate: (value) => value.length || "Required for async publishing",
    },
    {
      type: (_, answers) =>
        answers.asyncPublishingMode === "advanced" ? "text" : null,
      name: "mysqlHost",
      message: "Publisher MySQL host",
      initial: "localhost",
    },
    {
      type: (_, answers) =>
        answers.asyncPublishingMode === "advanced" ? "number" : null,
      name: "mysqlPort",
      message: "Publisher MySQL port",
      initial: 3306,
      min: 0,
    },
    {
      type: (_, answers) =>
        answers.asyncPublishingMode === "advanced" ? "text" : null,
      name: "mysqlUser",
      message: "Publisher MySQL username",
      initial: "root",
    },
    {
      type: (_, answers) =>
        answers.asyncPublishingMode === "advanced" ? "text" : null,
      name: "mysqlDatabase",
      message: "Publisher MySQL database name",
      initial: "dkg_publisher_db",
      validate: (value) =>
        isValidMysqlIdentifier(value) ||
        "Use letters, numbers, and underscores only",
    },
    {
      type: (_, answers) =>
        answers.asyncPublishingMode === "advanced" ? "text" : null,
      name: "redisUrl",
      message: "Publisher Redis URL",
      initial: "redis://localhost:6379",
    },
    {
      type: (_, answers) =>
        answers.asyncPublishingMode === "advanced" ? "number" : null,
      name: "workerCount",
      message: "Publisher worker count",
      initial: 1,
      min: 1,
    },
    {
      type: (_, answers) =>
        answers.asyncPublishingMode === "advanced" ? "number" : null,
      name: "pollFrequency",
      message: "Publisher poll frequency (ms)",
      initial: 2000,
      min: 100,
    },
    {
      type: (_, answers) =>
        answers.asyncPublishingMode === "advanced" ? "text" : null,
      name: "storagePath",
      message: "Publisher storage path",
      initial: "./data/publisher",
    },
    {
      type: (_, answers) =>
        answers.asyncPublishingMode === "advanced" ? "text" : null,
      name: "storageBaseUrl",
      message: "Publisher storage base URL",
      initial: "http://localhost:9200/storage",
    },
    {
      type: "confirm",
      name: "smtpEnabled",
      message: "Configure SMTP? This is required for password reset emails.",
      initial: true,
    },
    {
      type: (_, answers) => (answers.smtpEnabled ? "text" : null),
      name: "smtpHost",
      message: "SMTP Host",
      validate: (value) => value.length || "Required",
    },
    {
      type: (_, answers) => (answers.smtpEnabled ? "number" : null),
      name: "smtpPort",
      message: "SMTP Port",
      initial: 587,
      min: 0,
    },
    {
      type: (_, answers) => (answers.smtpEnabled ? "text" : null),
      name: "smtpUsername",
      message: "SMTP Username",
    },
    {
      type: (_, answers) => (answers.smtpEnabled ? "password" : null),
      name: "smtpPassword",
      message: "SMTP Password",
    },
    {
      type: (_, answers) => (answers.smtpEnabled ? "confirm" : null),
      name: "smtpSecure",
      message: "SMTP Secure",
      initial: true,
    },
    {
      type: (_, answers) => (answers.smtpEnabled ? "text" : null),
      name: "smtpFrom",
      message: "SMTP Sender email",
      initial: "noreply@example.com",
    },
    {
      type: "text",
      name: "dbFilename",
      message: "Database filename (e.g. example.db)",
      validate: (value) => value.length || "Required",
      format: (value) => (value.endsWith(".db") ? value : `${value}.db`),
    },
  ], {
    onCancel: () => {
      throw new Error("Setup cancelled by user");
    },
  });

  const requestedAsyncPublishing = response.asyncPublishingMode !== "disabled";
  const appUrl = "http://localhost:9200";
  const mysqlPassword =
    enginePassword.mysqlPassword || response.mysqlPassword || "";
  const publisherDefaults =
    requestedAsyncPublishing && mysqlPassword
      ? buildPublisherDefaults(appUrl, mysqlPassword, {
          mysqlHost: response.mysqlHost,
          mysqlPort: response.mysqlPort,
          mysqlUser: response.mysqlUser,
          mysqlDatabase: response.mysqlDatabase,
          redisUrl: response.redisUrl,
          workerCount: response.workerCount,
          pollFrequency: response.pollFrequency,
          storagePath: response.storagePath,
          storageBaseUrl: response.storageBaseUrl,
        })
      : null;

  if (requestedAsyncPublishing && !publisherDefaults) {
    throw new Error("Async publishing requires a MySQL password");
  }

  let publisherProvisionResult:
    | { databaseCreated: boolean; walletInserted: boolean }
    | null = null;
  let publisherProvisionError: string | null = null;

  if (publisherDefaults) {
    try {
      publisherProvisionResult = await provisionAsyncPublishing(
        publisherDefaults.databaseUrl,
        {
          privateKey: response.dkgPublishWallet,
          blockchain: response.dkgBlockchain,
        },
      );
    } catch (error: any) {
      publisherProvisionError = error.message;
      console.warn(
        `Publisher provisioning warning: ${publisherProvisionError}`,
      );
    }
  }

  const asyncPublishingEnabled =
    requestedAsyncPublishing && publisherProvisionError === null;

  const envLines = [
    "PORT=9200",
    `EXPO_PUBLIC_MCP_URL=${formatEnvValue(appUrl)}`,
    `EXPO_PUBLIC_APP_URL=${formatEnvValue(appUrl)}`,
    `DATABASE_URL=${formatEnvValue(response.dbFilename)}`,
    `LLM_PROVIDER=${formatEnvValue(response.llmProvider)}`,
    `LLM_MODEL=${formatEnvValue(response.llmModel)}`,
    `LLM_TEMPERATURE=${formatEnvValue(String(response.llmTemperature))}`,
    `LLM_SYSTEM_PROMPT=${formatEnvValue(response.llmSystemPrompt)}`,
    `${getLLMProviderApiKeyEnvName(response.llmProvider)}=${formatEnvValue(response.llmApiKey)}`,
    `DKG_PUBLISH_WALLET=${formatEnvValue(response.dkgPublishWallet)}`,
    `DKG_BLOCKCHAIN=${formatEnvValue(response.dkgBlockchain)}`,
    'DKG_OTNODE_URL="http://localhost:8900"',
    `ASYNC_PUBLISHING_ENABLED=${asyncPublishingEnabled ? "true" : "false"}`,
    `SMTP_HOST=${formatEnvValue(response.smtpHost || "")}`,
    `SMTP_PORT=${formatEnvValue(String(response.smtpPort || ""))}`,
    `SMTP_USER=${formatEnvValue(response.smtpUsername || "")}`,
    `SMTP_PASS=${formatEnvValue(response.smtpPassword || "")}`,
    `SMTP_SECURE=${response.smtpSecure === undefined ? "true" : response.smtpSecure}`,
    `SMTP_FROM=${formatEnvValue(response.smtpFrom || "")}`,
    `DOCUMENT_CONVERSION_PROVIDER=${formatEnvValue(response.docConversionProvider)}`,
  ];

  if (
    response.docConversionProvider === "mistral" &&
    response.llmProvider !== "mistralai"
  ) {
    envLines.push(`MISTRAL_API_KEY=${formatEnvValue(response.mistralApiKey)}`);
  }

  if (publisherDefaults) {
    envLines.push(`MYSQL_PASSWORD=${formatEnvValue(publisherDefaults.mysqlPassword)}`);
    envLines.push(`DKGP_DATABASE_URL=${formatEnvValue(publisherDefaults.databaseUrl)}`);
    envLines.push(`REDIS_URL=${formatEnvValue(publisherDefaults.redisUrl)}`);
    envLines.push(`WORKER_COUNT=${formatEnvValue(String(publisherDefaults.workerCount))}`);

    if (response.asyncPublishingMode === "advanced") {
      envLines.push(
        `POLL_FREQUENCY=${formatEnvValue(String(publisherDefaults.pollFrequency))}`,
      );
      envLines.push(`STORAGE_TYPE="filesystem"`);
      envLines.push(`STORAGE_PATH=${formatEnvValue(publisherDefaults.storagePath)}`);
      envLines.push(
        `STORAGE_BASE_URL=${formatEnvValue(publisherDefaults.storageBaseUrl)}`,
      );
    }
  }

  console.log("\nWriting .env file...");
  await writeFileWithContent(
    path.resolve(process.cwd(), ".env"),
    `${envLines.join("\n")}\n`,
  );

  console.log("Ensuring .env.development.local exists...");
  await createFileWithContent(
    path.resolve(process.cwd(), ".env.development.local"),
    `# These values will override the .env file during development
EXPO_PUBLIC_APP_URL="http://localhost:8081"
`,
  );

  configEnv();
  process.env.DATABASE_URL = response.dbFilename;
  process.env.EXPO_PUBLIC_MCP_URL = appUrl;
  process.env.EXPO_PUBLIC_APP_URL = appUrl;

  console.log("Configuring database...");
  console.log("Running migrations...");
  const db = configDatabase();

  console.log("Creating admin user...");
  try {
    const user = await createUser(
      db,
      {
        email: "admin@example.com",
        password: "admin123",
      },
      ["mcp", "llm", "blob", "scope123"],
    );

    console.log(`Created admin user:
  ID: ${user.id}
  Email: admin@example.com
  Password: admin123
  Scope: mcp, llm, blob, scope123

To create new users, run 'npm run script:createUser' inside of the agent directory.
`);
  } catch (error: any) {
    if (error.message?.includes("already exists")) {
      console.log("Admin user already exists. Skipping creation.");
    } else {
      throw error;
    }
  }

  console.log(`Async publishing: ${asyncPublishingEnabled ? "enabled" : "disabled"}`);
  if (publisherDefaults) {
    const passwordSource =
      enginePassword.status === "found"
        ? `Detected and copied MYSQL_PASSWORD from ${enginePassword.envPath}`
        : "Used the MYSQL_PASSWORD provided during advanced setup";
    console.log(passwordSource);
    if (publisherProvisionResult) {
      console.log(
        `Publisher DB ready: created=${publisherProvisionResult.databaseCreated}, walletInserted=${publisherProvisionResult.walletInserted}`,
      );
    }
    if (publisherProvisionError) {
      console.log(
        `Publisher provisioning warning: ${publisherProvisionError}. Async publishing was left disabled in apps/agent/.env.`,
      );
    }
  }
}

setup()
  .then(() => {
    console.log("Setup completed successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error occurred during setup:", error);
    process.exit(1);
  });
