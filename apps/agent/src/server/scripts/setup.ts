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
  isValidPrivateKey,
  isValidMysqlIdentifier,
  provisionAsyncPublishing,
  resolveEngineMysqlPassword,
  stripPrivateKeyPrefix,
} from "../setupPublisher";

function formatEnvValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const promptOptions = {
  onCancel: () => {
    throw new Error("Setup cancelled by user");
  },
};

const styles = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
};

function printBanner() {
  const lines = [
    "+------------------------------------------------------------+",
    "|                      DKG Agent Setup                       |",
    "|                                                            |",
    "|  This script will help you configure your DKG Agent.      |",
    "+------------------------------------------------------------+",
  ];

  console.log(
    `\n${styles.bold}${styles.blue}${lines.join("\n")}${styles.reset}\n`,
  );
}

function printSection(title: string, description?: string) {
  console.log(
    `\n${styles.bold}${styles.cyan}=== ${title} ===${styles.reset}`,
  );
  if (description) {
    console.log(`${styles.yellow}${description}${styles.reset}`);
  }
}

function getRecommendedWorkerCount(walletCount: number) {
  return Math.max(1, Math.min(Math.ceil(walletCount / 10), 5));
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

async function collectAdditionalPublisherWallets() {
  const additionalWallets: string[] = [];
  const addWalletsResponse = await prompts(
    {
      type: "confirm",
      name: "addMoreWallets",
      message:
        "Add more publishing wallets now? The primary wallet will already be included.",
      initial: false,
    },
    promptOptions,
  );

  let shouldAddWallet = addWalletsResponse.addMoreWallets === true;
  while (shouldAddWallet) {
    const walletResponse = await prompts(
      {
        type: "text",
        name: "privateKey",
        message: `Additional publish wallet private key #${additionalWallets.length + 1}`,
        validate: (value) => {
          if (!value.length) return "Required";
          return (
            isValidPrivateKey(value) ||
            "Private key must be 64 hexadecimal characters, with or without a 0x prefix"
          );
        },
      },
      promptOptions,
    );

    additionalWallets.push(walletResponse.privateKey);

    const continueResponse = await prompts(
      {
        type: "confirm",
        name: "addAnotherWallet",
        message: "Add another publishing wallet?",
        initial: false,
      },
      promptOptions,
    );
    shouldAddWallet = continueResponse.addAnotherWallet === true;
  }

  return additionalWallets;
}

async function collectAdvancedPublisherOptions(
  hasEngineDefaultMysqlPassword: boolean,
) {
  const connectionResponse = await prompts(
    [
      {
        type: "text",
        name: "mysqlHost",
        message: "Publisher MySQL host",
        initial: "localhost",
      },
      {
        type: "number",
        name: "mysqlPort",
        message: "Publisher MySQL port",
        initial: 3306,
        min: 0,
      },
      {
        type: "text",
        name: "mysqlUser",
        message: "Publisher MySQL username",
        initial: "root",
      },
      {
        type: "password",
        name: "mysqlPassword",
        message: hasEngineDefaultMysqlPassword
          ? "Publisher MySQL password (leave blank to use the password set during dkg-node install)"
          : "Publisher MySQL password",
        validate: (value) =>
          hasEngineDefaultMysqlPassword || value.length > 0
            ? true
            : "Required for async publishing",
      },
      {
        type: "text",
        name: "mysqlDatabase",
        message: "Publisher MySQL database name",
        initial: "dkg_publisher_db",
        validate: (value) =>
          isValidMysqlIdentifier(value) ||
          "Use letters, numbers, and underscores only",
      },
      {
        type: "text",
        name: "redisHost",
        message: "Publisher Redis host",
        initial: "localhost",
      },
      {
        type: "number",
        name: "redisPort",
        message: "Publisher Redis port",
        initial: 6379,
        min: 0,
      },
      {
        type: "password",
        name: "redisPassword",
        message: "Publisher Redis password (leave blank if no password)",
      },
    ],
    promptOptions,
  );

  const additionalWallets = await collectAdditionalPublisherWallets();
  const totalWalletCount = 1 + additionalWallets.length;
  const recommendedWorkerCount = getRecommendedWorkerCount(totalWalletCount);
  const workerDefaultsResponse = await prompts(
    [
      {
        type: "number",
        name: "workerCount",
        message: `Publisher worker count (default: ${recommendedWorkerCount}, based on wallet count; concurrency auto-balances)`,
        initial: recommendedWorkerCount,
        min: 1,
      },
      {
        type: "number",
        name: "pollFrequency",
        message: "Publisher poll frequency (ms)",
        initial: 2000,
        min: 100,
      },
      {
        type: "text",
        name: "storagePath",
        message: "Publisher storage path",
        initial: "./data/publisher",
      },
      {
        type: "text",
        name: "storageBaseUrl",
        message: "Publisher storage base URL",
        initial: "http://localhost:9200/storage",
      },
    ],
    promptOptions,
  );

  return {
    ...connectionResponse,
    ...workerDefaultsResponse,
    additionalWallets,
  };
}

async function setup() {
  const enginePassword = await resolveEngineMysqlPassword();
  printBanner();

  const asyncPublishingChoices =
    enginePassword.status === "found"
      ? [
          {
            title: "Yes (Recommended)",
            value: "recommended",
          },
          { title: "No", value: "disabled" },
          { title: "Yes, with advanced configuration", value: "advanced" },
        ]
      : [
          { title: "No (Recommended)", value: "disabled" },
          { title: "Yes, with advanced configuration", value: "advanced" },
        ];

  printSection(
    "DKG Agent LLM Configuration",
    "Choose the language model provider, credentials, model, and default system prompt for your DKG Agent.",
  );
  const llmResponse = await prompts([
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
  ], promptOptions);

  printSection(
    "Document Processing",
    "Choose how the agent should convert uploaded documents for downstream use.",
  );
  const documentResponse = await prompts([
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
        llmResponse.llmProvider !== "mistralai"
          ? "text"
          : null,
      name: "mistralApiKey",
      message: "MISTRAL_API_KEY",
      validate: (value) => value.length || "Required for Mistral OCR provider",
    },
  ], promptOptions);

  printSection(
    "DKG Interaction",
    "Configure the DKG network, blockchain, and publishing setup for your DKG Agent.",
  );
  if (enginePassword.status === "missing-file") {
    console.log(
      `DKG Publisher plugin MySQL defaults were not found at ${enginePassword.envPath}. Use advanced async setup if you want to provide them manually.`,
    );
  } else if (enginePassword.status === "missing-key") {
    console.log(
      `DKG Publisher plugin MySQL defaults are incomplete in ${enginePassword.envPath} because REPOSITORY_PASSWORD is missing. Use advanced async setup if you want to provide the password manually.`,
    );
  }

  const publishingResponse = await prompts([
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
      name: "dkgCustomRpc",
      message: "Custom blockchain RPC (leave blank to use default RPC)",
      format: (value) => value.trim(),
      validate: (value) =>
        !value.trim() ||
        isValidUrl(value.trim()) ||
        "Provide a valid URL or leave blank to use the default RPC",
    },
    {
      type: "text",
      name: "dkgPublishWallet",
      message: "Publish wallet private key",
      initial: (_, answers) =>
        answers.dkgEnv === "development"
          ? "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : "",
      validate: (value) => {
        if (!value.length) return "Required";
        return (
          isValidPrivateKey(value) ||
          "Private key must be 64 hexadecimal characters, with or without a 0x prefix"
        );
      },
    },
    {
      type: "select",
      name: "asyncPublishingMode",
      message:
        "Enable async publishing (DKG Publisher plugin) on the DKG for smoother publishing, easier status tracking, and queue management?",
      choices: asyncPublishingChoices,
      initial: 0,
    },
  ], promptOptions);

  const advancedPublisherResponse =
    publishingResponse.asyncPublishingMode === "advanced"
      ? (printSection(
          "Advanced Async Publishing",
          "Provide MySQL, Redis, wallet, worker, and storage overrides for the DKG Publisher plugin (async publishing).",
        ),
        await collectAdvancedPublisherOptions(enginePassword.status === "found"))
      : null;

  printSection(
    "Email Configuration",
    "Configure SMTP settings for password reset emails and other notifications.",
  );
  const emailResponse = await prompts([
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
  ], promptOptions);

  printSection(
    "DKG Agent Database",
    "Choose the local SQLite database file used by the DKG Agent.",
  );
  const finalResponse = await prompts([
    {
      type: "text",
      name: "dbFilename",
      message: "Database filename (e.g. example.db)",
      validate: (value) => value.length || "Required",
      format: (value) => (value.endsWith(".db") ? value : `${value}.db`),
    },
  ], promptOptions);

  const response = {
    ...llmResponse,
    ...documentResponse,
    ...publishingResponse,
    ...(advancedPublisherResponse || {}),
    ...emailResponse,
    ...finalResponse,
  };

  const requestedAsyncPublishing = response.asyncPublishingMode !== "disabled";
  const appUrl = "http://localhost:9200";
  const customRpc = response.dkgCustomRpc?.trim() || "";
  const envPublishWallet = stripPrivateKeyPrefix(response.dkgPublishWallet);
  const mysqlPassword =
    response.mysqlPassword?.trim() || enginePassword.mysqlPassword || "";
  const publisherDefaults =
    requestedAsyncPublishing && mysqlPassword
      ? buildPublisherDefaults(appUrl, mysqlPassword, {
          mysqlHost: response.mysqlHost,
          mysqlPort: response.mysqlPort,
          mysqlUser: response.mysqlUser,
          mysqlDatabase: response.mysqlDatabase,
          redisHost: response.redisHost,
          redisPort: response.redisPort,
          redisPassword: response.redisPassword,
          workerCount: response.workerCount,
          pollFrequency: response.pollFrequency,
          storagePath: response.storagePath,
          storageBaseUrl: response.storageBaseUrl,
        })
      : null;

  if (requestedAsyncPublishing && !publisherDefaults) {
    throw new Error("Async publishing requires a MySQL password");
  }

  const additionalPublisherWallets = advancedPublisherResponse?.additionalWallets || [];

  let publisherProvisionResult:
    | { databaseCreated: boolean; walletsInserted: number }
    | null = null;
  let publisherProvisionError: string | null = null;

  if (publisherDefaults) {
    try {
      publisherProvisionResult = await provisionAsyncPublishing(
        publisherDefaults.databaseUrl,
        [
          {
            privateKey: response.dkgPublishWallet,
            blockchain: response.dkgBlockchain,
          },
          ...additionalPublisherWallets.map((privateKey) => ({
            privateKey,
            blockchain: response.dkgBlockchain,
          })),
        ],
      );
    } catch (error: any) {
      publisherProvisionError = error.message;
      console.warn(
        `DKG Publisher plugin provisioning warning: ${publisherProvisionError}`,
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
    `DKG_PUBLISH_WALLET=${formatEnvValue(envPublishWallet)}`,
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

  if (customRpc) {
    envLines.push(`DKG_NODE_CUSTOM_RPC=${formatEnvValue(customRpc)}`);
  }

  if (
    response.docConversionProvider === "mistral" &&
    response.llmProvider !== "mistralai"
  ) {
    envLines.push(`MISTRAL_API_KEY=${formatEnvValue(response.mistralApiKey)}`);
  }

  if (publisherDefaults) {
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
    if (publisherProvisionResult) {
      console.log(
        `DKG Publisher plugin DB ready: created=${publisherProvisionResult.databaseCreated}, walletsInserted=${publisherProvisionResult.walletsInserted}`,
      );
    }
    if (publisherProvisionError) {
      console.log(
        `DKG Publisher plugin provisioning warning: ${publisherProvisionError}. Async publishing was left disabled in apps/agent/.env.`,
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
