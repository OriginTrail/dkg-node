import path from "path";
import prompts from "prompts";
import {
  configDatabase,
  configEnv,
  createFileWithContent,
  createUser,
} from "../helpers";
import { getLLMProviderApiKeyEnvName, LLMProvider } from "@/shared/chat";
import { DEFAULT_SYSTEM_PROMPT } from "@/shared/prompts/defaultSystemPrompt";

async function setup() {
  const r = await prompts([
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
      message: (prev) => "Model name",
      validate: (val) => val.length || "Model name is required",
    },
    {
      type: "number",
      name: "llmTemperature",
      message: (prev) => "Temperature",
      initial: 1,
      min: 0,
      max: 1,
      float: true,
    },
    {
      type: "text",
      name: "llmSystemPrompt",
      message: (prev) => "System prompt",
      initial: DEFAULT_SYSTEM_PROMPT,
      format: (val) => (val === DEFAULT_SYSTEM_PROMPT ? "" : val.trim()),
    },
    {
      type: "select",
      name: "docConversionProvider",
      message: "Document conversion provider",
      choices: [
        { title: "unpdf — basic PDF only", value: "unpdf" },
        { title: "Mistral OCR — complex PDF/DOCX/PPTX", value: "mistral" },
      ],
      initial: 0,
    },
    {
      type: (_, a) =>
        a.docConversionProvider === "mistral" && a.llmProvider !== "mistralai"
          ? "text"
          : null,
      name: "mistralApiKey",
      message: "MISTRAL_API_KEY",
      validate: (val) => val.length || "Required for Mistral OCR provider",
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
      type: (_, a) => (a.dkgEnv === "development" ? "text" : "select"),
      name: "dkgBlockchain",
      message: "DKG blockchain",
      initial: (_, a) => (a.dkgEnv === "development" ? "hardhat1:31337" : ""),
      choices: (prev) =>
        prev === "mainnet"
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
      initial: (_, a) =>
        a.dkgEnv === "development"
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : "",
      validate: (val) => val.length || "Required",
    },
    {
      type: "confirm",
      name: "smtpEnabled",
      message: "Configure SMTP? This is required for password reset emails.",
      initial: true,
    },
    {
      type: (_, a) => (a.smtpEnabled ? "text" : null),
      name: "smtpHost",
      message: "SMTP Host",
      validate: (val) => val.length || "Required",
    },
    {
      type: (_, a) => (a.smtpEnabled ? "number" : null),
      name: "smtpPort",
      message: "SMTP Port",
      initial: 587,
      min: 0,
    },
    {
      type: (_, a) => (a.smtpEnabled ? "text" : null),
      name: "smtpUsername",
      message: "SMTP Username",
    },
    {
      type: (_, a) => (a.smtpEnabled ? "password" : null),
      name: "smtpPassword",
      message: "SMTP Password",
    },
    {
      type: (_, a) => (a.smtpEnabled ? "confirm" : null),
      name: "smtpSecure",
      message: "SMTP Secure",
      initial: true,
    },
    {
      type: (_, a) => (a.smtpEnabled ? "text" : null),
      name: "smtpFrom",
      message: "SMTP Sender email",
      initial: "noreply@example.com",
    },
    {
      type: "text",
      name: "dbFilename",
      message: "Database filename (e.g. example.db)",
      validate: (val) => val.length || "Required",
      format: (val) => (val.endsWith(".db") ? val : `${val}.db`),
    },
  ]);

  console.log("\nCreating .env file...");
  await createFileWithContent(
    path.resolve(process.cwd(), ".env"),
    `PORT=9200
EXPO_PUBLIC_MCP_URL="http://localhost:9200"
EXPO_PUBLIC_APP_URL="http://localhost:9200"
DATABASE_URL="${r.dbFilename}"
LLM_PROVIDER="${r.llmProvider}"
LLM_MODEL="${r.llmModel}"
LLM_TEMPERATURE="${r.llmTemperature}"
LLM_SYSTEM_PROMPT="${r.llmSystemPrompt}"
${getLLMProviderApiKeyEnvName(r.llmProvider)}="${r.llmApiKey}"
DKG_PUBLISH_WALLET="${r.dkgPublishWallet}"
DKG_BLOCKCHAIN="${r.dkgBlockchain}"
DKG_OTNODE_URL="http://localhost:8900"
SMTP_HOST="${r.smtpHost || ""}"
SMTP_PORT="${r.smtpPort || ""}"
SMTP_USER="${r.smtpUsername || ""}"
SMTP_PASS="${r.smtpPassword || ""}"
SMTP_SECURE=${r.smtpSecure === undefined ? "true" : r.smtpSecure}
SMTP_FROM="${r.smtpFrom || ""}"
DOCUMENT_CONVERSION_PROVIDER="${r.docConversionProvider}"
${r.docConversionProvider === "mistral" && r.llmProvider !== "mistralai" ? `MISTRAL_API_KEY="${r.mistralApiKey}"\n` : ""}`,
  );

  console.log("Creating .env.development.local file...");
  await createFileWithContent(
    path.resolve(process.cwd(), ".env.development.local"),
    `# These values will override the .env file during the development
EXPO_PUBLIC_APP_URL="http://localhost:8081"
`,
  );

  configEnv();

  console.log("Configuring database...");
  console.log("Running migrations...");
  const db = configDatabase();

  console.log("Creating admin user...");
  const userId = await createUser(
    db,
    {
      email: "admin@example.com",
      password: "admin123",
    },
    ["mcp", "llm", "blob", "scope123"],
  );
  console.log(`Created admin user:
  ID: ${userId}
  Email: admin@example.com
  Password: admin123
  Scope: mcp, llm, blob, scope123

To create new users, run 'npm run script:createUser' inside of the agent directory.
`);
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
