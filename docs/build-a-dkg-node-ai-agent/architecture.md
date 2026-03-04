# Architecture

The DKG Node is built as a modular project with two core runtimes:

- The **DKG Engine**, which powers network communication and implements the core protocol
- The **DKG Node Runtime,** which hosts an AI Agent with MCP capabilities

Adding functionality is done through **Plugins,** which is where you'll likely spend the majority of your time coding. Conceptually, the architecture is illustrated below.

<figure><img src="../.gitbook/assets/DKG Node diagram2 (1).png" alt="" width="563"><figcaption></figcaption></figure>

#### DKG Node server (MCP) and Agent

This is the **“brain”** of your node. It runs all **plugins** and connects to the underlying services of the DKG node that AI agents or other applications use. It allows agents to **publish**, **query**, and **retrieve** Knowledge Assets directly from the OriginTrail DKG. It can also expose **REST APIs (via Express)** so your apps can interact with the node over HTTP.

#### Plugins

Plugins are like mini-apps for your DKG Node AI Agent — small add-ons that unlock new functionality. They can provide **MCP tools** (for AI agents), **HTTP endpoints**, or both.

Some useful built-in plugins include:

- **DKG Essential Plugin** — includes the basic tools for publishing and retrieving knowledge.
- **OAuth 2.1 authentication** — controls who can access your node.
- **Swagger** — automatically documents available APIs.

#### DKG Node Engine

The **DKG** **Engine** (formerly known as ot-node) implements the core OriginTrail protocol and is considered a dependency (not intended for implementing agent functionality). The DKG Node Engine should be kept up to date to ensure reliable and efficient communication with the rest of the network. It implements blockchain interactions, loads new knowledge assets from the network and validates them, performs staking transactions (in case of Core Nodes), etc.\
