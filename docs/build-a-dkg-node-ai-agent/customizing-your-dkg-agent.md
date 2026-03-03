# Customizing your DKG agent

Each DKG node includes a **collocated neuro-symbolic AI agent** that combines neural model capabilities (e.g., LLMs) with symbolic reasoning over RDF-based graph data. This enables DKG nodes not only to publish and query semantic knowledge but also to perform knowledge graph reasoning, summarization, and data transformation tasks directly on locally or remotely stored knowledge.

The **DKG Agent** is built around a modular **plugin system** centered on the **Model Context Protocol (MCP)**. Plugins define how the agent interacts with external tools, APIs, and reasoning systems. A generic DKG Node ships with a base set of plugins for common operations — such as knowledge publishing, retrieval, and validation — **while developers can extend functionality by creating custom plugins**.&#x20;

## Build your first plugin for the DKG Agent

The rest of this page will focus on how you can build custom plugins for your DKG Agent. For example, you might build a **Scientific Research** plugin to ingest papers and publish structured knowledge on the DKG, helping your agent drive research. Or a **Social Media** plugin to extract relevant posts, build a knowledge pool on the DKG, and run sentiment analysis.

### Option 1: Create a custom plugin inside the DKG monorepo

This is the easiest path if you’re already working inside the **DKG monorepo**.

#### 🔨 Steps

1.  **Use turbo to generate a plugin scaffold** (from the project root folder)

    ```bash
    turbo gen plugin
    ```

This will create all the files for your plugin in a new folder.

2. **Name your plugin**

We suggest you start your name with `plugin-` (example: `plugin-pdf-parser`), but it is not a hard requirement.

It will be created under `packages/plugin-<your-name>`

3. **Edit the plugin source**

Open the plugin source `packages/plugin-<your-name>/src/index.ts`

Your plugin comes pre-scaffolded with examples that show how to expose a tool both as an MCP tool and as a REST API route (more details on this in the [#exposing-tools-in-your-plugin](customizing-your-dkg-agent.md#exposing-tools-in-your-plugin "mention") section below). Your `index.ts` file should look something like this:

<figure><img src="../.gitbook/assets/Screenshot 2025-11-05 at 14.40.17.png" alt=""><figcaption></figcaption></figure>

Within the `defineDkgPlugin` module, on line 6 we expose the plugin code via an MCP tool through `mcp.registerTool()` and on line 50 the plugin exposes a classic HTTP API, in this case a GET route, via `api.get()`&#x20;

We recommend writing your custom plugin logic in your custom functions, like `yourCustomFunction` above, then use it within the `mcp.registerTool()` and `api.get()` code block.

1.  **(Optional) Add dependencies**

    ```bash
    npm install --save <package-name>
    ```

    Run this inside your `plugin-<your-name>` directory.

2.  **(optional) Add additional source files if needed (e.g., utils.ts)**
    - Place them in the `src/` directory.
    - Import them into your `index.ts`.
3.  **Once your are done, make sure to build your plugin by running**

    ```bash
    npm run build
    ```

    or:

    ```bash
    turbo build
    ```

4.  **Install your plugin in the DKG Node Agent**

    ```bash
    cd apps/agent
    npm install --save @dkg/plugin-<your-name>
    ```

    This package name is auto-generated (check `packages/plugin-<your-name>/package.json`).

5.  **Make sure to import your plugin and register it through** `createPluginServer`\
    \
    Open `apps/agent/src/server/index.ts` and add:

    ```ts
    import myCustomPlugin from "@dkg/plugin-<your-name>";

    const app = createPluginServer({
      // ... other config (name, context, dkg client, etc.)
      plugins: [
        defaultPlugin,
        oauthPlugin,
        dkgEssentialsPlugin,
        examplePlugin.withNamespace("protected", {
          middlewares: [authorized(["scope123"])],
        }),

        // Add your own plugin here
        myCustomPlugin,
      ],
    });
    ```

6.  **Run your DKG Node Agent**

    Start the agent from the project root folder and run `npm run dev` . Test that your plugin is registered and working

To learn how DKG plugins work internally, see the [#how-do-dkg-plugins-work](customizing-your-dkg-agent.md#how-do-dkg-plugins-work "mention") section below.

### Option 2: Create a standalone DKG plugin (npm package)

If you want to create your plugin outside of the monorepo and manage it as your separate package, you can! Follow the steps below

#### 🔨 Steps

1.  **Create a new Node.js project**

    ```bash
    npm init
    ```

    (or use an existing project)

2.  **Add "@dkg/plugins" package as a dependency**

    ```bash
    npm install --save @dkg/plugins
    ```

3.  **Define your plugin**

    ```ts
    import { defineDkgPlugin } from "@dkg/plugins";

    const myCustomPlugin = defineDkgPlugin((ctx, mcp, api) => {
      // Example MCP tool
      // mcp.registerTool("my-mcp-tool", ... );
      // Example API route
      // api.get("/my-get-route", (req, res) => ... );
    });

    export default myCustomPlugin;
    ```

4.  **(Optional) Add configuration support**\
    You can export your plugin as a function that accepts options:

    ```ts
    const configurablePlugin = (options: {...}) =>
      defineDkgPlugin((ctx, mcp, api) => { ... });
    ```

5.  **(Optional) Publish to npm**
    - Run `npm publish` to share with the DKG builder community.

{% hint style="warning" %}
💡**Tip:** See how the already existing plugins are created by looking into existing plugin packages in the monorepo, e.g `packages/plugin-auth` and `packages/plugin-example`.
{% endhint %}

### How do DKG plugins work?

DKG plugins are **functions** applied in the order you register them.\
While you _can_ define inline functions, using `defineDkgPlugin` is recommended for:

- **Type-safety**
- **Extension methods**

#### `defineDkgPlugin` arguments

When you define a plugin, the DKG Node automatically injects three objects:

1. **`ctx` (Context)**
   - `ctx.logger` → Logger instance for logging messages
   - `ctx.dkg` → DKG Client instance for interacting with the DKG network
2. **`mcp` (MCP Server)**
   - An instance of the MCP Server from `@modelcontextprotocol/sdk`
   - Use it to register MCP tools and resources
3. **`api` (API Server)**
   - Express server instance from the express npm package
   - Use it to expose REST API routes from your plugin

All registered routes and MCP tools become part of the **DKG Node API server**.

### Exposing tools in your plugin

#### Exposing as MCP Tools

MCP tools are automatically available to the DKG Agent (or any MCP client connected to your Node).

**Example of how to expose tools** **(auto-scaffolded by `turbo gen plugin`):**

```ts
mcp.registerTool(
  "add",
  {
    title: "Tool name",
    description: "Tool description",
    inputSchema: {
      /* expected input variables and format */
    },
  },
  // YOUR TOOL CODE HERE
);
```

If your MCP tool needs scope-based authorization, use the same `mcp.registerTool(...)` API and wrap the handler with `withRequiredMcpScope`:

```ts
import { withRequiredMcpScope } from "@dkg/plugins";

mcp.registerTool(
  "my-protected-tool",
  {
    title: "Protected tool",
    description: "Runs only when required scope is present",
    inputSchema: {},
  },
  withRequiredMcpScope("my.scope", async (input, context) => {
    // Put your real tool logic here (call services, validate input, query APIs, etc.).
    // this is just an example response shape.
    return { content: [{ type: "text", text: "ok" }] };
  }),
);
```

{% hint style="success" %}

#### Including source Knowledge Assets in your MCP tool responses

When building custom tools for your DKG Node Agent, you can attach **Source Knowledge Assets** to any MCP tool response, allowing the DKG Node Agent (and other agents you might use with your DKG Node) to display which Knowledge Assets were used to form the answer.

See the [Source Knowledge Assets in tool responses](https://app.gitbook.com/o/-McnF-Jcg4utndKcdeko/s/-McnEkhdd7JlySeckfHM/~/changes/408/manage-and-extend-your-dkg-node/what-are-dkg-node-plugins/dkg-node-essentials-plugin/~/comments#source-knowledge-assets-in-tool-responses) section of the DKG Essentials plugin page for full details and examples.
{% endhint %}

#### Exposing as REST API routes

Expose routes through the API server for more “traditional” API calls.

**Example of how to expose tools through API routes** **(auto-scaffolded by `turbo gen plugin`):**

```ts
api.get("/ROUTE_NAME", (req, res) => {
  // YOUR TOOL CODE HERE
});
```

💡 **Tip: Test your API routes with Swagger**\
When your DKG Node is running, all exposed API routes are automatically documented and testable via the Swagger UI:

- Open [http://localhost:9200/swagger](http://localhost:9200/swagger)
- You’ll see:
  - All registered API routes
  - Descriptions (from your route/tool definitions)
  - Input/output schemas (from your route/tool definitions)
  - Ability to **test requests directly in the browser**

This makes it easy to confirm your plugin’s routes are working as expected.

### Using plugins in the DKG Node

Once your plugin is built, register it in the DKG Node and (optionally) configure it with extension methods like `.withNamespace()`.

#### 1) Install & import

In the `apps/agent` folder run:

```bash
npm install --save @dkg/plugin-<your-plugin-name>
```

Open `apps/agent/src/server/index.ts` and import your plugin:

```ts
import myCustomPlugin from "@dkg/plugin-<your-name>";
```

#### 2) Register your plugin in `createPluginServer`

<pre class="language-ts"><code class="lang-ts">const app = createPluginServer({
<strong>  // ... other config (name, context, dkg client, etc.)
</strong>  plugins: [
    defaultPlugin,
    oauthPlugin,
    dkgEssentialsPlugin,

    // Protect routes with middleware
    examplePlugin.withNamespace("protected", {
      middlewares: [authorized(["scope123"])],
    }),

    // Add your own plugin here
    myCustomPlugin.withNamespace("protected", {
      middlewares: [authorized(["scope123"])],
    }),
  ],
});
</code></pre>

#### Notes

- `.withNamespace("...")` is optional — it scopes your plugin’s routes/tools under a namespace and lets you attach middlewares (e.g., auth/permissions) - more on that in the [Configure access & security](broken-reference) section&#x20;
- All registered **MCP tools** and **API routes** from your plugins are exposed via the DKG Node API.
- You can combine inline plugins and imported packages in the same `plugins` array.

#### Run & verify

Start your DKG Node and confirm your plugin’s endpoints/tools are available under the configured namespace by running:

```bash
npm run dev
```

(from the root folder) 🎉
