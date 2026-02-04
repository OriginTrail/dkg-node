# AGENTS.md - DKG Node Codebase Guide

> Quick reference for coding agents working on this Turborepo monorepo.

---

## Definition of Done (DoD) — Required for Every Change

Before you consider a task "done", you must:

1. **Keep the change minimal and consistent**
   - Follow existing patterns in the surrounding code.
   - Prefer small, reviewable diffs (aim for < 300 lines); split large tasks into subtasks/commits.
   - New production files should be < 300 lines; split into modules if needed.

2. **Quality gates** — Run these checks and fix any failures:

   ```bash
   turbo format check-types lint build
   ```

3. **Tests** — Add/extend tests for new behavior covering at least:
   - **Core Functionality**
   - **Error Handling**

4. **Docs** — If you add a new plugin/tool/route/env var, document it briefly (README or the relevant plugin docs).

5. **Commit** — Propose a commit message using conventional format: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

---

## Architecture

- **Turborepo monorepo** | Node.js >= 22 | npm workspaces
- **Main app**: `apps/agent` (Expo frontend + Express backend with MCP server)
- **Plugins**: `packages/plugin-*` (modular DKG/MCP/API functionality)
- **Tech stack**: SQLite, Drizzle ORM, Expo Router, Model Context Protocol, DKG.js

## Plugin System (Core Pattern)

```typescript
// packages/plugin-{name}/src/index.ts
import { defineDkgPlugin } from "@dkg/plugins";
import { openAPIRoute, z } from "@dkg/plugin-swagger";

export default defineDkgPlugin((ctx, mcp, api) => {
  // ctx: { dkg: DKG, blob: BlobStorage }
  // mcp: McpServer for AI tools
  // api: Express Router for HTTP endpoints

  // Register MCP tool
  mcp.registerTool(
    "tool-name",
    {
      title: "Tool Title",
      description: "Description for LLM",
      inputSchema: { param: z.string() },
    },
    async ({ param }) => ({
      content: [{ type: "text", text: "result" }],
    }),
  );

  // Register API endpoint
  api.get(
    "/endpoint",
    openAPIRoute(
      {
        tag: "Category",
        summary: "Description",
        query: z.object({ param: z.string() }),
        response: { schema: z.object({ result: z.any() }) },
      },
      (req, res) => {
        res.json({ result: req.query.param });
      },
    ),
  );
});

// Namespaced plugin with auth
export const protectedPlugin = plugin.withNamespace("protected", {
  middlewares: [authorized(["scope-name"])],
});
```

## Critical Conventions

### DKG Responses & Provenance

When returning results derived from the DKG, prefer including provenance / source Knowledge Assets when supported. This ensures traceability back to the original data sources.

### API Routes

- **ALWAYS** use `openAPIRoute()` wrapper (auto-validates + generates Swagger docs)
- **ALWAYS** validate with Zod schemas
- Returns 400 auto for invalid inputs

### Testing

Always write tests along with features

```typescript
// tests/{name}.spec.ts - MUST import from dist/
import plugin from "../dist/index.js";
import {
  createMcpServerClientPair,
  createExpressApp,
  createInMemoryBlobStorage,
  createMockDkgClient,
} from "@dkg/plugins/testing";

const mockDkgContext = {
  dkg: createMockDkgClient(),
  blob: createInMemoryBlobStorage(),
};

// Required test categories: "Core Functionality" and "Error Handling"
```

### Database

- Drizzle ORM with SQLite
- Schemas in `src/database/schema.ts` or `src/server/database/sqlite/`
- Migrations in `drizzle/` folder
- Generate: `npm run build:migrations`

### File Structure

```
packages/plugin-{name}/
├── src/index.ts          # Export defineDkgPlugin
├── tests/{name}.spec.ts  # Import from ../dist/
├── package.json          # Dependencies: @dkg/plugins, @dkg/plugin-swagger
├── tsconfig.json
└── eslint.config.mjs
```

## Essential Commands

```bash
# Development
npm run dev              # Start all services
turbo gen plugin         # Generate new plugin
npm run build            # Build all packages

# Before commits
turbo format check-types lint build

# Testing
npm test                 # All tests
npm run test:api         # Plugin tests only
npm run test:integration # Integration tests

# Database (from apps/agent dir)
npm run build:migrations # Generate migrations
npm run drizzle:studio   # Visual DB browser
```

## Auth & Middleware

```typescript
import { authorized } from "@dkg/plugin-oauth";

// Apply scope-based auth
api.use("/protected", authorized(["scope-name"]));

// Access auth in handler
const userId = res.locals.auth?.extra?.userId;
```

## Common Pitfalls

1. **Tests import from dist**, NOT src: `import from "../dist/index.js"`
2. **Always use openAPIRoute** for API endpoints (breaks Swagger otherwise)
3. **Run `npm install` at root** after adding plugin dependencies
4. **TypeScript config**: Extends `@dkg/typescript-config/base.json`
5. **Plugin namespaces**: Prefix MCP tools automatically (`namespace__toolName`)

## Key Imports

```typescript
import { defineDkgPlugin, DkgContext, DkgPlugin } from "@dkg/plugins";
import { openAPIRoute, z } from "@dkg/plugin-swagger";
import { authorized } from "@dkg/plugin-oauth";
import type { express } from "@dkg/plugins/types";
```

## Environment Variables

```bash
# Required
DATABASE_URL=dkg.db                    # SQLite DB name
OPENAI_API_KEY=sk-...                  # LLM API key
DKG_PUBLISH_WALLET=0x...               # Blockchain wallet

# Optional
DKG_BLOCKCHAIN=hardhat1:31337          # Network
DKG_OTNODE_URL=http://localhost:8900   # dkg-engine
PORT=9200                              # Server port
EXPO_PUBLIC_MCP_URL=http://localhost:9200
EXPO_PUBLIC_APP_URL=http://localhost:8081
```

## Test Template

```typescript
describe("Plugin Name", () => {
  let mockMcpServer, mockMcpClient, apiRouter, app;

  beforeEach(async () => {
    const { server, client, connect } = await createMcpServerClientPair();
    mockMcpServer = server;
    mockMcpClient = client;
    apiRouter = express.Router();
    app = createExpressApp();

    plugin(mockDkgContext, mockMcpServer, apiRouter);
    await connect();

    // Mount the router (required for API endpoint tests)
    app.use("/", apiRouter);
  });

  describe("Core Functionality", () => {
    it("should register tools", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);
      expect(tools.some((t) => t.name === "tool-name")).to.equal(true);
    });
  });

  describe("Error Handling", () => {
    it("should return 400 for invalid input", async () => {
      await request(app).get("/endpoint").expect(400);
    });
  });
});
```

## Frontend (React Native + Expo)

- **Path alias**: `@/` → `src/`
- **Routing**: File-based via Expo Router
- **Protected routes**: `app/(protected)/`
- **Layout**: `app/_layout.tsx`

## Plugin Registration

```typescript
// apps/agent/src/server/index.ts
import myPlugin from "@dkg/plugin-my-name";

const app = createPluginServer({
  name: "DKG API",
  version: "1.0.0",
  context: { dkg, blob: blobStorage },
  plugins: [
    defaultPlugin,
    oauthPlugin,
    myPlugin, // Add here
    swaggerPlugin({ version, securitySchemes }),
  ],
});
```

## Code Quality

- **Formatter**: Prettier (auto-formats)
- **Linter**: ESLint with TypeScript
- **Type checking**: `npm run check-types`
- **Pre-commit**: Format → Lint → Type check → Build

## Debugging Tips

1. Check `apps/agent/dist/index.js` exists after build
2. View Swagger docs: `http://localhost:9200/swagger`
3. Integration tests in `apps/agent/tests/integration/`
4. Use `tsx` for running scripts: `npx tsx script.ts`
5. Use docs about DKG Node project at `docs`
6. Reset to fresh database (only when DB is corrupted or needs clean slate): `rm *.db && npm run script:setup`

## Reference Examples

- **Simple plugin**: `packages/plugin-example/`
- **Complex plugin**: `packages/plugin-dkg-publisher/`
- **OAuth patterns**: `packages/plugin-oauth/`
- **Testing guide**: `packages/PLUGIN_TESTING_GUIDE.md`
