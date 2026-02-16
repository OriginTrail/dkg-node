# Interacting with your DKG Agent

{% hint style="info" %}
This section assumes you have finished [Installation](decentralized-knowledge-graph-dkg.md) and will guide you through trying out the basic DKG Agent that comes bundled with the DKG Node.
{% endhint %}

Each DKG node includes a **collocated neuro-symbolic AI agent** that combines neural model capabilities (e.g., LLMs) with symbolic reasoning over RDF-based graph data. This enables DKG nodes not only to publish and query semantic knowledge but also to perform knowledge graph reasoning, summarization, and data transformation tasks directly on locally or remotely stored knowledge.

The **DKG Agent** is built around a modular **plugin system** centered on the **Model Context Protocol (MCP)**. Plugins define how the agent interacts with external tools, APIs, and reasoning systems. A generic DKG Node ships with a base set of plugins for common operations — such as knowledge publishing, retrieval, and validation — **while developers can extend functionality by creating custom plugins**.

Each plugin may expose both **MCP endpoints** (for agentic interoperability) and **classic REST/gRPC APIs** (for programmatic access). Example plugin types include ontology-specific retrieval tools (e.g., “social media query” modules), **knowledge-mining pipelines** for crafting Knowledge Assets aligned with domain ontologies, and **reasoning plugins** that apply declarative rule sets to infer new knowledge.

If you want to jump right into building your custom plugins, head over to the ["Build a DKG Node AI Agent"](../build-a-dkg-node-ai-agent/customizing-your-dkg-agent.md) section. The remainder of this section will familiarize you with the "boilerplate" DKG Node.

## **Accessing and using the DKG Agent Interface**

Your DKG Node comes with a built-in agent interface serving two core purposes:

* **Secure authentication portal** → OAuth 2.1 login system for accessing your DKG Node
* **AI agent interface** → Direct chat with your DKG-Node-powered agent

The interface is built with **React Native (Expo)** for cross-platform compatibility, enabling a seamless interaction with your agent and the Decentralized Knowledge Graph (DKG).

{% hint style="info" %}
If you are following this guide, make sure your [**DKG Node is running**](decentralized-knowledge-graph-dkg.md#id-7.-start-the-node), if it’s not already active.
{% endhint %}

<figure><img src="../.gitbook/assets/Screenshot 2025-08-13 at 10.17.48.png" alt=""><figcaption></figcaption></figure>

### What’s included <a href="#whats-included" id="whats-included"></a>

Your DKG Node interface provides two initial pages (routes):

<table data-header-hidden><thead><tr><th width="103.078125">Route</th><th>What is it</th><th>Link (UI)</th><th>Backend route</th></tr></thead><tbody><tr><td><code>/login</code></td><td>Authentication</td><td><code>http://localhost:9200/login</code></td><td><code>http://localhost:8081/login</code></td></tr><tr><td><code>/chat</code></td><td>Agent Chatbot interface</td><td><code>http://localhost:9200/chat</code></td><td><code>http://localhost:8081/chat</code></td></tr></tbody></table>

{% hint style="info" %}
If you try to access `/chat` while logged out, you’ll be redirected to `/login`. Once signed in, you’re automatically redirected back.
{% endhint %}

### Using the built-in agent interface <a href="#using-the-built-in-agent-interface" id="using-the-built-in-agent-interface"></a>

**Authentication**

Once you set up the node, you can use the default credentials to sign in.

```
Email: admin@example.com
Password: admin123
```

To create additional custom users with required scopes: at least `mcp` and `llm` (see [Security](security.md))

Authentication is based on OAuth 2.1.

**Agent capabilities**

* **Natural language conversation** with your DKG Node Agent
* **File uploads** via the **Attach file(s)** button for use with tools
* **Automatic tool usage** → The agent detects and invokes tools from all registered plugins (including DKG Essentials + your custom plugins) based on your queries — e.g., publishing or extracting knowledge from the DKG
* **Source transparency** → When tools return **Knowledge Asset Unique Asset Locators (UALs)** from the DKG, results will display the **source Knowledge Assets** the agent used to generate its answer (see [DKG Essentials plugin for details](../build-a-dkg-node-ai-agent/essentials-plugin.md)).

### External MCP client integration

Your DKG Node **uses a** **standard MCP server** (with OAuth 2.1 over HTTPS), so you can connect it to any compatible MCP client, equipping them with the power of the DKG and your DKG Node. For example, you can connect your dev IDE, like Cursor, directly to the DKG Node MCP server.

#### Supported clients (not exhaustive)

**Cursor**

* Go to **Settings → Tools & Integrations → New MCP Server**
*   Example config:

    ```json
    {
      "mcpServers": {
        "dkg-mcp": {
          "url": "http://localhost:9200/mcp"
        }
      }
    }
    ```
* Click **Needs login** under your server name to authenticate

**VS Code**

* Open **Command Palette (Ctrl/Cmd + Shift + P)** → “MCP: Add Server…”
* Select transport: **HTTP**
* Enter server URL: `http://localhost:9200/mcp`
* When prompted, click **Allow**

**Microsoft Copilot Studio**

* Follow [Microsoft’s MCP integration docs](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent).
