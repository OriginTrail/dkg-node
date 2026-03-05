import prompts from "prompts";
import {
  addPublisherWallets,
  buildPublisherDefaults,
  isValidMysqlIdentifier,
  isValidPrivateKey,
  listPublisherWallets,
  readAgentEnv,
  resolveEngineMysqlPassword,
  resolvePublisherConfigFromAgentEnv,
  resetPublisherDatabase,
  setPublisherWalletActive,
  stripPrivateKeyPrefix,
  type AgentEnvState,
  upsertAgentEnvValues,
} from "../setupPublisher";

const promptOptions = {
  onCancel: () => {
    throw new Error("DKG Publisher plugin setup cancelled by user");
  },
};

const styles = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
};

const LOCK_STALE_THRESHOLD_MS = 30 * 60 * 1000;

function printBanner() {
  const lines = [
    "+------------------------------------------------------------+",
    "|            DKG Publisher Plugin Management                 |",
    "|                                                            |",
    "|  Configure DKG Publisher plugin for async publishing.     |",
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

function isStaleLock(lockedAt: Date | null) {
  if (!lockedAt) {
    return false;
  }
  return Date.now() - lockedAt.getTime() >= LOCK_STALE_THRESHOLD_MS;
}

function resolvePublisherConfigSafely(
  envValues: Record<string, string>,
  appUrl: string,
  options: { silent?: boolean } = {},
) {
  try {
    return resolvePublisherConfigFromAgentEnv(envValues, appUrl);
  } catch (error: any) {
    if (!options.silent) {
      console.warn(
        `Existing DKG Publisher plugin configuration could not be parsed (${error.message}).`,
      );
    }
    return null;
  }
}

async function collectAdditionalWallets(options?: {
  promptForFirstConfirmation?: boolean;
}) {
  const wallets: string[] = [];

  let shouldAdd = options?.promptForFirstConfirmation === false;
  if (!shouldAdd) {
    const addWalletsResponse = await prompts(
      {
        type: "confirm",
        name: "addWallets",
        message: "Add additional publishing wallets?",
        initial: false,
      },
      promptOptions,
    );
    shouldAdd = addWalletsResponse.addWallets === true;
  }

  while (shouldAdd) {
    const walletResponse = await prompts(
      {
        type: "text",
        name: "privateKey",
        message: `Additional publish wallet private key #${wallets.length + 1}`,
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

    wallets.push(walletResponse.privateKey);

    const continueResponse = await prompts(
      {
        type: "confirm",
        name: "addAnother",
        message: "Add another publishing wallet?",
        initial: false,
      },
      promptOptions,
    );
    shouldAdd = continueResponse.addAnother === true;
  }

  return wallets;
}

async function ensurePrimaryWallet(envPublishWallet: string | undefined) {
  if (envPublishWallet && isValidPrivateKey(envPublishWallet)) {
    return envPublishWallet;
  }

  const response = await prompts(
    {
      type: "text",
      name: "primaryWallet",
      message:
        "Primary publish wallet private key (required for publisher provisioning)",
      validate: (value) =>
        isValidPrivateKey(value) ||
        "Private key must be 64 hexadecimal characters, with or without a 0x prefix",
    },
    promptOptions,
  );

  return response.primaryWallet as string;
}

async function runUpdateConfigMode() {
  const envState = await readAgentEnv();
  const enginePassword = await resolveEngineMysqlPassword();
  const appUrl = envState.values.EXPO_PUBLIC_MCP_URL || "http://localhost:9200";
  const publisherConfig = resolvePublisherConfigSafely(
    envState.values,
    appUrl,
    { silent: true },
  );

  printSection(
    "Update DKG Publisher Plugin Config",
    "Update MySQL/Redis settings and seed wallets for async publishing.",
  );

  const mysqlPasswordFromEnv = publisherConfig?.mysql.password || "";
  const mysqlPasswordFromEngine = enginePassword.mysqlPassword || "";
  const mysqlPasswordDefault = mysqlPasswordFromEnv || mysqlPasswordFromEngine;
  const hasDefaultMysqlPassword = mysqlPasswordDefault.length > 0;

  const connectionResponse = await prompts(
    [
      {
        type: "text",
        name: "mysqlHost",
        message: "Publisher MySQL host",
        initial: publisherConfig?.mysql.host || "localhost",
      },
      {
        type: "number",
        name: "mysqlPort",
        message: "Publisher MySQL port",
        initial: publisherConfig?.mysql.port || 3306,
        min: 0,
      },
      {
        type: "text",
        name: "mysqlUser",
        message: "Publisher MySQL username",
        initial: publisherConfig?.mysql.user || "root",
      },
      {
        type: "password",
        name: "mysqlPassword",
        message: hasDefaultMysqlPassword
          ? "Publisher MySQL password (leave blank to use the password set during dkg-node install)"
          : "Publisher MySQL password",
        validate: (value) =>
          hasDefaultMysqlPassword || value.length > 0
            ? true
            : "Required for async publishing",
      },
      {
        type: "text",
        name: "mysqlDatabase",
        message: "Publisher MySQL database name",
        initial: publisherConfig?.mysql.database || "dkg_publisher_db",
        validate: (value) =>
          isValidMysqlIdentifier(value) ||
          "Use letters, numbers, and underscores only",
      },
      {
        type: "text",
        name: "redisHost",
        message: "Publisher Redis host",
        initial: publisherConfig?.redis.host || "localhost",
      },
      {
        type: "number",
        name: "redisPort",
        message: "Publisher Redis port",
        initial: publisherConfig?.redis.port || 6379,
        min: 0,
      },
      {
        type: "password",
        name: "redisPassword",
        message: "Publisher Redis password (leave blank if no password)",
        initial: publisherConfig?.redis.password || "",
      },
    ],
    promptOptions,
  );

  const primaryWallet = await ensurePrimaryWallet(envState.values.DKG_PUBLISH_WALLET);
  const normalizedPrimaryWalletForEnv = stripPrivateKeyPrefix(primaryWallet);
  const additionalWallets = await collectAdditionalWallets();
  const walletCount = 1 + additionalWallets.length;

  const advancedResponse = await prompts(
    {
      type: "confirm",
      name: "advanced",
      message: "Configure advanced worker and storage overrides?",
      initial: false,
    },
    promptOptions,
  );

  const recommendedWorkerCount = getRecommendedWorkerCount(walletCount);
  const workerDefaultsResponse: {
    workerCount: number;
    pollFrequency?: number;
    storagePath?: string;
    storageBaseUrl?: string;
  } = advancedResponse.advanced
    ? await prompts(
        [
          {
            type: "number",
            name: "workerCount",
            message: `Publisher worker count (default: ${recommendedWorkerCount}, based on wallet count; concurrency auto-balances)`,
            initial:
              publisherConfig?.workerCount ||
              recommendedWorkerCount,
            min: 1,
          },
          {
            type: "number",
            name: "pollFrequency",
            message: "Publisher poll frequency (ms)",
            initial: publisherConfig?.pollFrequency || 2000,
            min: 100,
          },
          {
            type: "text",
            name: "storagePath",
            message: "Publisher storage path",
            initial: publisherConfig?.storagePath || "./data/publisher",
          },
          {
            type: "text",
            name: "storageBaseUrl",
            message: "Publisher storage base URL",
            initial:
              publisherConfig?.storageBaseUrl ||
              new URL("/storage", appUrl).toString().replace(/\/$/, ""),
            validate: (value) =>
              isValidUrl(value) || "Provide a valid URL",
          },
        ],
        promptOptions,
      )
    : {
        workerCount: publisherConfig?.workerCount || recommendedWorkerCount,
      };

  const mysqlPassword =
    connectionResponse.mysqlPassword?.trim() || mysqlPasswordDefault;
  if (!mysqlPassword) {
    throw new Error("Async publishing requires a MySQL password");
  }

  const publisherDefaults = buildPublisherDefaults(appUrl, mysqlPassword, {
    mysqlHost: connectionResponse.mysqlHost,
    mysqlPort: connectionResponse.mysqlPort,
    mysqlUser: connectionResponse.mysqlUser,
    mysqlDatabase: connectionResponse.mysqlDatabase,
    redisHost: connectionResponse.redisHost,
    redisPort: connectionResponse.redisPort,
    redisPassword: connectionResponse.redisPassword,
    workerCount: workerDefaultsResponse.workerCount,
    pollFrequency: workerDefaultsResponse.pollFrequency,
    storagePath: workerDefaultsResponse.storagePath,
    storageBaseUrl: workerDefaultsResponse.storageBaseUrl,
  });

  const blockchain = envState.values.DKG_BLOCKCHAIN || "hardhat1:31337";
  const walletSeeds = [
    { privateKey: primaryWallet, blockchain },
    ...additionalWallets.map((privateKey) => ({ privateKey, blockchain })),
  ];

  const provisionResult = await addPublisherWallets(
    publisherDefaults.databaseUrl,
    walletSeeds,
  );

  await upsertAgentEnvValues(
    {
      DKGP_DATABASE_URL: publisherDefaults.databaseUrl,
      REDIS_URL: publisherDefaults.redisUrl,
      WORKER_COUNT: workerDefaultsResponse.workerCount,
      ASYNC_PUBLISHING_ENABLED: true,
      DKG_PUBLISH_WALLET: normalizedPrimaryWalletForEnv,
      ...(advancedResponse.advanced
        ? {
            POLL_FREQUENCY: publisherDefaults.pollFrequency,
            STORAGE_TYPE: "filesystem",
            STORAGE_PATH: publisherDefaults.storagePath,
            STORAGE_BASE_URL: publisherDefaults.storageBaseUrl,
          }
        : {
            POLL_FREQUENCY: null,
            STORAGE_TYPE: null,
            STORAGE_PATH: null,
            STORAGE_BASE_URL: null,
          }),
    },
    envState.envPath,
  );

  console.log(
    `DKG Publisher plugin configuration updated. walletsInserted=${provisionResult.walletsInserted}`,
  );
}

function printWalletTable(
  wallets: Array<{
    id: number;
    address: string;
    blockchain: string;
    isActive: boolean;
    isLocked: boolean;
    totalUses: number;
  }>,
) {
  if (!wallets.length) {
    console.log("No wallets found in the DKG Publisher plugin database.");
    return;
  }

  console.log("");
  console.log("ID  Active  Locked  Uses  Blockchain       Address");
  for (const wallet of wallets) {
    const id = wallet.id.toString().padEnd(3, " ");
    const active = (wallet.isActive ? "yes" : "no").padEnd(7, " ");
    const locked = (wallet.isLocked ? "yes" : "no").padEnd(7, " ");
    const uses = wallet.totalUses.toString().padEnd(5, " ");
    const chain = wallet.blockchain.padEnd(15, " ");
    console.log(
      `${id}${active}${locked}${uses}${chain}${wallet.address}`,
    );
  }
}

async function runWalletManagementMode() {
  printSection(
    "Manage DKG Publisher Plugin Wallets",
    "List, add, deactivate, or reactivate wallets in the DKG Publisher plugin database.",
  );

  const envState = await readAgentEnv();
  const appUrl = envState.values.EXPO_PUBLIC_MCP_URL || "http://localhost:9200";
  const publisherConfig = resolvePublisherConfigSafely(
    envState.values,
    appUrl,
  );

  if (!publisherConfig) {
    throw new Error(
      "DKGP_DATABASE_URL is missing in apps/agent/.env. Run DKG Publisher plugin config update first.",
    );
  }

  const blockchain = envState.values.DKG_BLOCKCHAIN || "hardhat1:31337";
  let keepRunning = true;

  while (keepRunning) {
    const wallets = await listPublisherWallets(publisherConfig.databaseUrl);

    const actionResponse = await prompts(
      {
        type: "select",
        name: "action",
        message: "Wallet management action",
        choices: [
          { title: "List wallets", value: "list" },
          { title: "Add wallet(s)", value: "add" },
          { title: "Deactivate wallet", value: "deactivate" },
          { title: "Reactivate wallet", value: "reactivate" },
          { title: "Back", value: "back" },
        ],
        initial: 0,
      },
      promptOptions,
    );

    if (actionResponse.action === "back") {
      keepRunning = false;
      continue;
    }

    if (actionResponse.action === "list") {
      printWalletTable(wallets);
      continue;
    }

    if (actionResponse.action === "add") {
      const additionalWallets = await collectAdditionalWallets({
        promptForFirstConfirmation: false,
      });
      if (!additionalWallets.length) {
        console.log("No wallets were added.");
        continue;
      }

      const result = await addPublisherWallets(
        publisherConfig.databaseUrl,
        additionalWallets.map((privateKey) => ({ privateKey, blockchain })),
      );
      console.log(`Wallet add complete. walletsInserted=${result.walletsInserted}`);
      continue;
    }

    if (actionResponse.action === "deactivate") {
      const activeWallets = wallets.filter((wallet) => wallet.isActive);
      if (!activeWallets.length) {
        console.log("No active wallets available to deactivate.");
        continue;
      }

      const targetResponse = await prompts(
        {
          type: "select",
          name: "walletId",
          message: "Choose wallet to deactivate",
          choices: activeWallets.map((wallet) => ({
            title: `#${wallet.id} ${wallet.address} (${wallet.isLocked ? "locked" : "available"})`,
            value: wallet.id,
          })),
        },
        promptOptions,
      );

      const selected = wallets.find((wallet) => wallet.id === targetResponse.walletId);
      if (!selected) {
        console.log("Wallet not found.");
        continue;
      }

      let forceUnlock = false;
      if (selected.isLocked) {
        if (!isStaleLock(selected.lockedAt)) {
          console.log(
            `Wallet #${selected.id} is currently locked. Wait for the active publish to finish before deactivating.`,
          );
          continue;
        }

        const unlockResponse = await prompts(
          {
            type: "confirm",
            name: "forceUnlock",
            message:
              "Wallet appears locked for over 30 minutes. Force unlock and deactivate?",
            initial: false,
          },
          promptOptions,
        );
        forceUnlock = unlockResponse.forceUnlock === true;
        if (!forceUnlock) {
          console.log("Deactivation cancelled.");
          continue;
        }
      }

      const result = await setPublisherWalletActive(
        publisherConfig.databaseUrl,
        selected.id,
        false,
        { forceUnlock },
      );
      console.log(
        `Wallet #${result.id} deactivated${result.forcedUnlock ? " (forced unlock applied)" : ""}.`,
      );
      continue;
    }

    if (actionResponse.action === "reactivate") {
      const inactiveWallets = wallets.filter((wallet) => !wallet.isActive);
      if (!inactiveWallets.length) {
        console.log("No inactive wallets available to reactivate.");
        continue;
      }

      const targetResponse = await prompts(
        {
          type: "select",
          name: "walletId",
          message: "Choose wallet to reactivate",
          choices: inactiveWallets.map((wallet) => ({
            title: `#${wallet.id} ${wallet.address}`,
            value: wallet.id,
          })),
        },
        promptOptions,
      );

      const result = await setPublisherWalletActive(
        publisherConfig.databaseUrl,
        targetResponse.walletId,
        true,
      );
      console.log(`Wallet #${result.id} reactivated.`);
    }
  }
}

async function runFreshResetMode() {
  const envState = await readAgentEnv();
  const appUrl = envState.values.EXPO_PUBLIC_MCP_URL || "http://localhost:9200";
  const publisherConfig = resolvePublisherConfigSafely(
    envState.values,
    appUrl,
  );

  if (!publisherConfig) {
    throw new Error(
      "DKGP_DATABASE_URL is missing in apps/agent/.env. Run DKG Publisher plugin config update first.",
    );
  }

  printSection(
    "Fresh Setup (Will Delete Existing Data)",
    "This will drop DKG Publisher plugin tables and recreate them. Existing async publishing queue/status history will be removed.",
  );

  const confirmationResponse = await prompts(
    {
      type: "text",
      name: "confirmation",
      message: 'Type "RESET DKG PUBLISHER DATA" to continue',
      validate: (value) =>
        value === "RESET DKG PUBLISHER DATA" ||
        'Type exactly: RESET DKG PUBLISHER DATA',
    },
    promptOptions,
  );

  if (confirmationResponse.confirmation !== "RESET DKG PUBLISHER DATA") {
    console.log("DKG Publisher plugin fresh setup cancelled.");
    return;
  }

  const primaryWallet = await ensurePrimaryWallet(envState.values.DKG_PUBLISH_WALLET);
  const normalizedPrimaryWalletForEnv = stripPrivateKeyPrefix(primaryWallet);
  const additionalWallets = await collectAdditionalWallets();
  const blockchain = envState.values.DKG_BLOCKCHAIN || "hardhat1:31337";
  const walletSeeds = [
    { privateKey: primaryWallet, blockchain },
    ...additionalWallets.map((privateKey) => ({ privateKey, blockchain })),
  ];

  const result = await resetPublisherDatabase(
    publisherConfig.databaseUrl,
    walletSeeds,
  );

  await upsertAgentEnvValues(
    {
      ASYNC_PUBLISHING_ENABLED: true,
      DKG_PUBLISH_WALLET: normalizedPrimaryWalletForEnv,
    },
    envState.envPath,
  );

  console.log(
    `DKG Publisher plugin fresh setup complete. droppedTables=${result.droppedTables.length}, walletsInserted=${result.walletsInserted}`,
  );
}

async function shouldContinueManaging() {
  const response = await prompts(
    {
      type: "confirm",
      name: "continueManaging",
      message: "Run another DKG Publisher plugin action?",
      initial: false,
    },
    promptOptions,
  );

  return response.continueManaging === true;
}

async function main() {
  printBanner();
  let envState: AgentEnvState;
  try {
    envState = await readAgentEnv();
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "apps/agent/.env was not found. Run npm run script:setup first.",
      );
    }
    throw error;
  }
  const appUrl = envState.values.EXPO_PUBLIC_MCP_URL || "http://localhost:9200";
  let publisherConfig = resolvePublisherConfigSafely(
    envState.values,
    appUrl,
  );

  if (!publisherConfig) {
    console.log(
      "DKG Publisher plugin config was not found in apps/agent/.env. Starting config update mode.",
    );
    await runUpdateConfigMode();
    const continueAfterAutoSetup = await shouldContinueManaging();
    if (!continueAfterAutoSetup) {
      console.log("DKG Publisher plugin management finished.");
      return;
    }
    envState = await readAgentEnv();
    publisherConfig = resolvePublisherConfigSafely(
      envState.values,
      envState.values.EXPO_PUBLIC_MCP_URL || "http://localhost:9200",
    );
  }

  if (!publisherConfig) {
    throw new Error(
      "DKG Publisher plugin configuration is still missing after setup. Verify DKGP_DATABASE_URL in apps/agent/.env.",
    );
  }

  let done = false;
  while (!done) {
    const response = await prompts(
      {
        type: "select",
        name: "mode",
        message: "Choose DKG Publisher plugin management mode",
        choices: [
          { title: "Update DKG Publisher plugin config", value: "config" },
          { title: "Manage wallets", value: "wallets" },
          { title: "Fresh setup (will delete existing data)", value: "reset" },
          { title: "Exit", value: "exit" },
        ],
        initial: 0,
      },
      promptOptions,
    );

    if (response.mode === "exit") {
      done = true;
      continue;
    }

    try {
      if (response.mode === "config") {
        await runUpdateConfigMode();
      } else if (response.mode === "wallets") {
        await runWalletManagementMode();
      } else if (response.mode === "reset") {
        await runFreshResetMode();
      }

      const continueManaging = await shouldContinueManaging();
      if (!continueManaging) {
        done = true;
      }
    } catch (error: any) {
      console.error(`DKG Publisher plugin management error: ${error.message}`);
    }
  }

  console.log("DKG Publisher plugin management finished.");
}

main().catch((error) => {
  console.error("Error occurred during DKG Publisher plugin management:", error);
  process.exit(1);
});
