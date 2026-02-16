---
description: DKG Edge Node
---

# Installation

The **DKG Edge Node** is your gateway to verifiable AI. It's an intuitive, app-style node that lets you create and interact with verifiable knowledge effortlessly. With the DKG Edge Node you can build reliable AI applications powered by the Decentralized Knowledge Graph (DKG) with ease.

The DKG Edge Node runs on devices at the “edge” (e.g., laptops, phones, IoT, and even servers, if deployed that way). It enables local knowledge processing, private-graph handling, and integration with AI-pipelines (via APIs like dRAG), allowing owners to retain control of their data while still contributing to the global DKG.

{% hint style="info" %}
If you are new to OriginTrail, DKG, knowledge graphs, or blockchains, we highly recommend becoming familiar with the [DKG—Key concepts](../dkg-key-concepts.md) before proceeding.
{% endhint %}

### What are we installing today?

You will be installing the **DKG Edge Node on your machine.** You can think of the DKG Edge Node as a framework for building neuro-symbolic AI agents based on the OriginTrail Decentralized Knowledge Graph. When you finish, a basic DKG-based neuro-symbolic agent will be accessible through a user interface (chatbot) and via MCP and a classic API. You will be able to customize it to your will by building plugins and extensions.

To install the **DKG Edge Node**, we will be using the DKG CLI (`dkg-cli`) - a streamlined command-line interface that automates much of the process and project maintenance. The CLI will automatically install all **DKG Edge Node** components (DKG Agent, DKG Engine), including databases — by default MySQL, Redis, and Blazegraph.

### The DKG utilizes blockchain

The DKG Network utilizes blockchains as a trusted environment for incentivisation and securing data exchanges. It's a multichain network, so DKG Nodes support 3 blockchains, but can currently be deployed on a **single blockchain at a time** (multichain deployment support is on the way).

If you're not too familiar with blockchain technology, and not sure which blockchain to pick to get started with the DKG Node, which one is better for you etc - don't worry, a default blockchain will be chosen for you and you will be able to learn as you go (the DKG Node abstracts a lot of the complexities of blockchain for you). You shouldn't notice a big difference between blockchains while you are in development — this choice matters most when you are ready for your DKG Node deployment to mainnet.

For now, you need to know the following:

* A DKG node requires a blockchain to run
* Because of that, it will require a set of crypto tokens — **TRAC** for DKG features, and the native token of the chosen blockchain (if you choose the default, it will be NEURO as the native token of Neuroweb)
* This will not cost you — the development setup leverages the **DKG testnet,** which utilizes _test tokens_ that have no economic value and you can get for free (more info below). To run an agent on the **DKG Mainnet,** however, you will need _"real"_ tokens

### What do you need for the installation?

* A **macOS** or **Linux** machine with at least 8GB RAM and 20GB storage space (Windows version is on the way)
* NVM and Node.js **v22.20.0** or higher installed
* About 15-30 minutes of your time to complete all the steps

### OK, let's go! <a href="#installation-steps" id="installation-steps"></a>

#### 1. First, install the DKG-CLI <a href="#id-1-install-cli" id="id-1-install-cli"></a>

```sh
npm install -g dkg-cli
```

#### 2. Generate the DKG Node Configuration <a href="#id-2-generate-configuration" id="id-2-generate-configuration"></a>

Your DKG Node allows for rich configuration (more on that in the **Configuration** section later), however this setup focuses on a minimal default configuration.

We recommend setting up your project folder and starting with the default development setup on DKG testnet.

```bash
# Make a new folder for your DKG Node project in your working directory
mkdir my_dkg_node
cd my_dkg_node

# If you're just getting started with the default blockchain - Neuroweb Testnet
dkg-cli setup-config --testnet

# Advanced: Pick a blockchain and environment. These are all the possible options for each blockchain
# dkg-cli setup-config --testnet --neuroweb   # NeuroWeb testnet
# dkg-cli setup-config --testnet --base       # Base testnet
# dkg-cli setup-config --testnet --gnosis     # Gnosis testnet
# dkg-cli setup-config --mainnet --neuroweb   # NeuroWeb mainnet
# dkg-cli setup-config --mainnet --base       # Base mainnet
# dkg-cli setup-config --mainnet --gnosis     # Gnosis mainnet
```

This will create an `.env` file with pre-generated DKG Node blockchain keys (learn more about DKG Node keys [here](../dkg-knowledge-hub/learn-more/node-keys-wallets.md)). This is done for convenience; you can change those keys if you'd like

All DKG node wallets require native blockchain tokens, while the publishing wallet also requires TRAC tokens. Wallets generated by the setup command will be presented to you (as shown in the image below)

<figure><img src="../.gitbook/assets/Screenshot 2025-10-31 at 17.02.59.png" alt="" width="563"><figcaption></figcaption></figure>

**MySQL configuration:**

If you have an existing MySQL database already configured on your environment, please make sure to pass your root password to `DB_PASSWORD` parameter in the setup .env file.&#x20;

If you do not have MySQL installed, password passed this parameter will be set as your root password.&#x20;

#### 3. Funding wallets <a href="#id-4-fund-wallets" id="id-4-fund-wallets"></a>

As mentioned previously, your DKG Node requires tokens to be able to create Knowledge Assets.

**To get tokens for the DKG testnet, use the** [**testnet token faucet**](../dkg-knowledge-hub/useful-resources/test-token-faucet.md)**.** For DKG Mainnet deployments, we suggest visiting the [TRAC token](https://origintrail.io/technology/trac-token) page to check for its availability.

{% hint style="warning" %}
Make sure to fund your node keys with tokens before running the `dkg-cli install` command; otherwise, your DKG node might not function correctly.
{% endhint %}

Here's an overview of supported blockchains and the required tokens per key type.

| Blockchain | Operational keys | Publish keys |
| ---------- | ---------------- | ------------ |
| NeuroWeb   | NEURO            | NEURO + TRAC |
| Base       | ETH              | ETH + TRAC   |
| Gnosis     | xDAI             | xDAI + TRAC  |

#### 4. Installing your DKG Node <a href="#id-5-install" id="id-5-install"></a>

```sh
dkg-cli install
```

{% hint style="success" %}
The installation can take a few minutes. It installs the DKG Node in the same directory from which you ran both `setup-config` and `dkg-cli install` commands.
{% endhint %}

#### 5. Configure your DKG Agent <a href="#id-6-configure-agent" id="id-6-configure-agent"></a>

Run the agent setup script to enable LLM features. You'll be prompted for your LLM provider, API key, model name, and DKG environment (must match your setup-config choice: testnet or mainnet).&#x20;

```sh
cd dkg-node
dkg-cli agent-setup
```

DKG Agent supports various LLM providers. Some examples include:

| Provider                   | API Key Link                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ |
| **OpenAI**                 | [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)         |
| **Anthropic** (Claude)     | [https://console.anthropic.com/](https://console.anthropic.com/)                     |
| **Groq** (Fast, free tier) | [https://console.groq.com/keys](https://console.groq.com/keys)                       |
| **Google GenAI**           | [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey) |
| **Mistral AI**             | [https://console.mistral.ai/](https://console.mistral.ai/)                           |
| **xAI**                    | [https://x.ai/](https://x.ai/)                                                       |

#### **6. Start DKG Agent (MCP Server)**

Once all services are up and running, you can start the **DKG Agent (MCP Server)**.\
To do so, navigate to the `dkg-node` directory and execute the following command:

```sh
dkg-cli run-dev
```

This starts the DKG Agent (MCP server) in **developmen**t mode and exposes the Web UI.

{% hint style="success" %}
Complete production deployment instructions are to be provided soon, including Linux server deployments, SSL/HTTPS configuration, systemd units, and other production setup requirements.
{% endhint %}

#### 7. UI & API access <a href="#id-7-access--use" id="id-7-access--use"></a>

Once the `npm run dev` command has been executed, the **DKG Agent** (MCP Server) will start, and the **Web UI** will become available for access. You can then interact with the system through both the web interface and the API as described below.

* Local macOS or Linux: [http://localhost:8081](http://localhost:8081/)
* Default login: `admin@example.com` / `admin123`

#### 8. DKG Node management <a href="#management-commands" id="management-commands"></a>

This section covers the key aspects of managing your DKG Node, including **DKG CLI commands**, **security and networking guidelines**, and **user management**. It provides an overview of the core services, their default ports, and tools for controlling, monitoring, and maintaining your DKG Node environment.

#### 8.1 DKG Node controls (using dkg-cli) <a href="#id-7-access--use" id="id-7-access--use"></a>

The DKG CLI provides essential commands for managing your DKG Node services, including **dkg-engine**, **Blazegraph**, and **MySQL**. These tools allow you to control, monitor, and inspect service statuses and logs efficiently.

```sh
# Checks the status of all DKG Node services (dkg-engine, Blazegraph, or MySQL)
dkg-cli status

# Starts the DKG Node (and all its services - dkg-engine, Blazegraph, MySQL etc)
# Automatically detects your OS and uses the appropriate service manager (systemd on Linux, pm2/brew on macOS)
dkg-cli start

# Start or stop the specified service
dkg-cli start dkg-engine
dkg-cli start blazegraph
dkg-cli start mysql
dkg-cli stop dkg-engine
dkg-cli stop blazegraph
dkg-cli stop mysql

# Restarts all DKG Node services
dkg-cli restart

# Restart a specific service
dkg-cli restart dkg-engine
dkg-cli restart blazegraph
dkg-cli restart mysql

# View logs (live)
dkg-cli logs dkg-engine --follow
dkg-cli logs blazegraph --follow
dkg-cli logs mysql --follow

# View last N lines (e.g., 50 lines)
dkg-cli logs dkg-engine -n 50
dkg-cli logs blazegraph -n 50
dkg-cli logs mysql -n 50

# Show help
dkg-cli --help
```

{% hint style="success" %}
All commands work from any directory and automatically detect your operating system to use the appropriate service manager.
{% endhint %}

#### 8.2 Creating new users <a href="#id-7-access--use" id="id-7-access--use"></a>

A `createUser` is also possible via the `dkg-cli` included to simplify the creation of additional user accounts.

```sh
cd dkg-node
dkg-cli create-user
# Enter: email, password, permissions (e.g., `mcp llm blob scope123`)
```

#### 8.3 Security & networking <a href="#security--network" id="security--network"></a>

**`.env` file:**

* Contains sensitive data (wallet keys, passwords, API keys)
* Never commit to version control

**Services and ports**\
The following list provides an overview of which services are running locally and the ports they listen on:

* **8081** — Web UI & API
* **8900** — DKG Engine API
* **3306** — MySQL
* **6379** — Redis

### Support <a href="#support" id="support"></a>

* 📖 [Documentation](https://docs.origintrail.io/)
* 🐛 [Report issues](https://github.com/OriginTrail/dkg-node-installer/issues)
* 💬 [Discord community](https://discord.com/invite/xCaY7hvNwD)
