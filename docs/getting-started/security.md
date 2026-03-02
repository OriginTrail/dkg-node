---
description: >-
  Understand authentication, permissioning, and access controls to keep your DKG
  Node secure while serving agents and users.
---

# Security

## **Access & authentication overview**

Your DKG Node includes a secure, built-in authentication system powered by **OAuth 2.1**, ensuring that both human users and AI agents can safely interact with your node and its APIs.

This section will guide you through:

- **Understanding OAuth 2.1** - why it’s used, and how it enables secure integrations with tools like Cursor, VS Code, and Copilot.
- **Managing users and tokens** - how to create, edit, and assign access scopes through the CLI or **Drizzle Studio**.
- **Securing custom plugins** - applying scoped authorization so only approved users or agents can access sensitive endpoints.

### OAuth

By default, the DKG Node uses **OAuth 2.1** for authentication, powered by:

- `@dkg/plugin-oauth`
- `@modelcontextprotocol/sdk` (TypeScript framework)

**Why OAuth 2.1?**

- Recommended standard for AI agent integrations.
- Works seamlessly with agents like **VS Code/GitHub Copilot**, **Cursor AI Agent mode**, and other OAuth-compatible clients.
- Supports **Dynamic Client Registration** → AI agents can automatically discover and connect to your DKG Node.

**User data is managed in a built-in SQLite operational database**, which stores:

- User account information (username & password)
- Permissions and access scopes
- OAuth tokens issued by the server
- Manually created authentication tokens

### Creating users

DKG Node includes a script for adding new user accounts with specific permissions.

Run from `apps/agent/`:

```bash
npm run script:createUser
```

Follow the prompts to enter:

- **Username** → unique identifier for the user
- **Password** → a secure password
- **Scope(s)** → permissions (e.g., `"mcp llm"` for full access)

🔍 **Managing users with Drizzle Studio**

- Starts automatically with `npm run dev`
- Or run manually:

  ```bash
  npm run drizzle:studio
  ```

- Accessible at: [http://local.drizzle.studio](http://local.drizzle.studio/?utm_source=chatgpt.com)

With Drizzle Studio, you can:

- View all users
- Edit user information
- Manage permissions/scopes
- Monitor issued tokens

### Creating tokens

OAuth works with **access tokens**. Tokens allow secure, programmatic access to your DKG Node without user interaction.

To create a token, run the following command from `apps/agent/` folder:

```bash
npm run script:createToken
```

Follow the prompts:

- **Scope(s)** → define permissions (e.g., `"mcp llm epcis.read epcis.write"`) — more on managing permission scopes in the section [#managing-permission-scopes](security.md#managing-permission-scopes "mention") below
- **Expiration** → choose how long the token should remain valid

Examples:

- `epcis.read` → EPCIS read scope (effective when EPCIS plugin is enabled)
- `epcis.write` → EPCIS write scope (effective when EPCIS plugin is enabled)
- `mcp epcis.read` → EPCIS read MCP tools over `/mcp` (when EPCIS plugin is enabled)
- `mcp epcis.write` → EPCIS capture/capture-status MCP tools over `/mcp` (when EPCIS plugin is enabled)

**When to use tokens**

- Giving **agents access** to tools and resources on your DKG Node
- Automated scripts and integrations
- Service-to-service communication
- Testing and development
- Apps without user interaction

### Using a token

DKG Node OAuth Tokens are standard **Bearer tokens**. Include them in the `Authorization` header of your API requests, for example:

```http
"Authorization": "Bearer 0198a297-f390-76ad-9208-ffae7e248b17"
```

### Managing permission scopes

Access in the DKG Node is **scope-based**:

- By default in the current `apps/agent/src/server/index.ts` runtime:
  - `/mcp` → requires `mcp` scope
  - `/llm` → requires `llm` scope
  - `/blob` → requires `blob` scope
  - `/change-password` and `/profile` → require authentication (empty scope list)
- Only users or tokens with those scopes can access the corresponding routes.

EPCIS scopes (`epcis.read`, `epcis.write`) are included in OAuth configuration, but EPCIS routes/tools are available only after the EPCIS plugin is mounted.

When EPCIS is enabled and HTTP guards are applied, this mapping is used:

- `GET /epcis/events`, `GET /epcis/events/track` → `epcis.read`
- `POST /epcis/capture`, `GET /epcis/capture/:captureID` → `epcis.write`

For EPCIS MCP tools (transported through `/mcp`), `/mcp` still requires `mcp`, and tools additionally require:

- `epcis-query`, `epcis-track-item` → `epcis.read`
- `epcis-capture`, `epcis-capture-status` → `epcis.write`

For custom MCP tools, keep the standard `mcp.registerTool(...)` flow and guard only the handler:

```ts
import { withRequiredMcpScope } from "@dkg/plugins";

mcp.registerTool(
  "my-tool",
  config,
  withRequiredMcpScope("my.scope", async (input, context) => {
    return { content: [{ type: "text", text: "ok" }] };
  }),
);
```

This keeps plugin developer ergonomics unchanged while enforcing tool-level scopes.

**IMPORTANT: Custom plugins are not protected automatically**\
When you create custom plugins, you must **assign scopes,** or they’ll be exposed without protection.

To secure them, register plugins in `apps/agent/src/server/index.ts` using `.withNamespace()`:

```ts
const app = createPluginServer({
  // ... other config
  plugins: [
    defaultPlugin,
    oauthPlugin,
    dkgEssentialsPlugin,

    // Protect routes with middleware
    examplePlugin.withNamespace("protected", {
      middlewares: [authorized(["scope123"])],
    }),

    // Custom plugin with its own scope
    myCustomPlugin.withNamespace("protected", {
      middlewares: [authorized(["customscope"])],
    }),
  ],
});
```

In this example, only users or tokens with the `customscope` scope can access your custom plugin.

Scopes are assigned during:

- **User creation** (via `npm run script:createUser`)
- **Token creation** (via `npm run script:createToken`)
- Or later, through **Drizzle Studio**.
