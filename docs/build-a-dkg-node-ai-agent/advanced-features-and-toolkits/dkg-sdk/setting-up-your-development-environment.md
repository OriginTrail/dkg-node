---
description: How to setup a local and shared development environment
---

# Development environment setup

## Running node engines on the DKG testnet (recommended)

We recommend following the [Installation guide](../../../getting-started/decentralized-knowledge-graph-dkg.md) for testnet setup instructions.

## Running a local DKG network

These instructions are made for macOS and Linux.

### Prerequisites

* An installed and running **Blazegraph**
  * To download and run Blazegraph, please visit their [official website](https://blazegraph.com/).
* An installed and running **MySQL**
  * You need to create an empty table named **operationaldb** inside MySQL.
* You should have **npm** and **Node.js (v16)** installed.

{% hint style="success" %}
Need any assistance with node setup? Join the [Discord ](https://discord.com/invite/xCaY7hvNwD)chat and find help within the OriginTrail tech community!
{% endhint %}

### Installation steps

First, clone the ot-node repo by running:

```sh
git clone https://github.com/OriginTrail/ot-node
```

Navigate to it:

```sh
cd ot-node
```

Change the branch:

```sh
git checkout v8/develop
```

Then, install the required dependencies by running:

```sh
npm install
```

Next, create a file called `.env` and add the following lines:

```sh
NODE_ENV=development
RPC_ENDPOINT_BC1=http://127.0.0.1:8545
RPC_ENDPOINT_BC2=http://127.0.0.1:9545
```

To start the local DKG network, run the **local network setup** script to install multiple node engines in the local environment. To ensure stability of operation, it is recommended to run at least 5 node engines (1 bootstrap and 4 subsequent node engines).

{% hint style="warning" %}
The scripts below only work for macOS and Linux (or Windows WSL).

If you need help with the setup, contact the core development team on [Discord](https://discord.com/invite/FCgYk2S).
{% endhint %}

\
To start the local DKG network on **macOS**, run the following command:

```sh
bash tools/local-network-setup/setup-macos-environment.sh --nodes=5
```

To start the local DKG network on **Linux**, run the following command:

```sh
./tools/local-network-setup/setup-linux-environment.sh --nodes=5
```

{% hint style="info" %}
#### Contributing

These setup instructions are a work in progress and are subject to change. The core development team expects to introduce improvements in setting up the DKG node engine in the local environment in the future.

As DKG Node is open source, we **happily invite you to contribute to building the Decentralized Knowledge Graph.** We're excited about your contributions!

Please visit the [GitHub](https://github.com/OriginTrail/ot-node) repo for more info.
{% endhint %}
