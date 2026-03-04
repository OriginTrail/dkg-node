const { publish, defineConfig } = require("test-results-reporter");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load .env from agent directory
// __dirname is apps/agent/tests/e2e/utils, go up 3 levels to apps/agent
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const teamsHookBaseURL = process.env.DKG_Node_Teams_Hook;
const jenkinsUrl = process.env.JENKINS_URL;

// Check if required environment variables are set
if (!teamsHookBaseURL) {
  console.error("Error: DKG_Node_Teams_Hook environment variable is not set");
  console.error(
    "Please add DKG_Node_Teams_Hook to your .env file in apps/agent/",
  );
  process.exit(1);
}

// Check if XML test results file exists
// __dirname is apps/agent/tests/e2e/utils, go up 3 levels to apps/agent
const xmlFilePath = path.resolve(__dirname, "../../../DKG_Node_UI_Tests.xml");
if (!fs.existsSync(xmlFilePath)) {
  console.error(`Error: Test results file not found at: ${xmlFilePath}`);
  console.error("Please run the UI tests first using: npm run test:e2e");
  process.exit(1);
}

// Build extensions array conditionally
const extensions = [
  {
    name: "quick-chart-test-summary",
  },
];

// Only add hyperlinks extension if JENKINS_URL is set
if (jenkinsUrl) {
  extensions.push({
    name: "hyperlinks",
    inputs: {
      links: [
        {
          text: "UI Tests HTML Report",
          url: `${jenkinsUrl}/job/DKG-Node-Tests/DKG_20Node_20UI_20Report/*zip*/DKG_20Node_20UI_20Report.zip`,
        },
      ],
    },
  });
}

const config = defineConfig({
  reports: [
    {
      targets: [
        {
          name: "teams",
          condition: "fail",
          inputs: {
            url: teamsHookBaseURL,
            only_failures: true,
            publish: "test-summary-slim",
            title: "DKG Node UI Tests Report",
            width: "Full",
          },
          extensions: extensions,
        },
      ],
      results: [
        {
          type: "junit",
          files: [xmlFilePath],
        },
      ],
    },
  ],
});

publish({ config });
