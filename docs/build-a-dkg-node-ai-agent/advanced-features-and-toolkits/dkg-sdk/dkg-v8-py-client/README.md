---
description: Python library for interacting with the DKG
---

# DKG Python SDK (dkg.py)

If you are looking to build applications leveraging [Knowledge Assets](./#create-a-knowledge-collection) on the OriginTrail Decentralized Knowledge Graph (DKG), the dkg.py library is the best place to start!

The DKG SDK is used together with an **OriginTrail gateway node** to build applications that interface with the OriginTrail DKG (the node is a dependency). Therefore, you either need to run a gateway node on [your local environment](../setting-up-your-development-environment.md) or a [hosted DKG Node](../../../../getting-started/decentralized-knowledge-graph-dkg.md), in order to use the SDK.

## Prerequisites

* python ≥ 3.11
* poetry ≥ 1.8.5

## Installation

The library can be used in any Python application.

Run the command to install dkg.py library using pip:

```bash
pip install dkg
```

pip x:

```bash
pipx install dkg
```

or poetry:

```bash
poetry add dkg==8.0.1
```

## :snowboarder: Quickstart

This package includes both synchronous and asynchronous versions of the DKG client.

The synchronous client is designed for applications that accept blocking calls. It operates sequentially, making it simpler to integrate into existing codebases that do not use asynchronous programming.

The asynchronous client is built for non-blocking operations, making it ideal for scenarios where multiple tasks need to run concurrently. It is generally faster than the synchronous client.

### Synchronous DKG client

To use the Synchronous DKG library, you need to connect to a running local or remote OT-node.

<pre class="language-python"><code class="lang-python">from dkg import DKG
<strong>from dkg.providers import BlockchainProvider, NodeHTTPProvider
</strong>
node_provider = NodeHTTPProvider(endpoint_uri="http://localhost:8900", api_version="v1")
blockchain_provider = BlockchainProvider(
    Environments.DEVELOPMENT.value, # or TESTNET, MAINNET
    BlockchainIds.HARDHAT_1.value,
)

dkg = DKG(node_provider, blockchain_provider)

print(dkg.node.info)
# if successfully connected, this should print the dictionary with node version
# { "version": "8.X.X" }
</code></pre>

### Asynchronous DKG client

The asynchronous DKG client leverages Python's `asyncio` library for managing asynchronous operations. Below is an example of how to set up and use the asynchronous DKG client:

```python
import asyncio
from dkg.providers import AsyncBlockchainProvider, AsyncNodeHTTPProvider
from dkg import AsyncDKG

async def main():
    node_provider = AsyncNodeHTTPProvider(
        endpoint_uri="http://localhost:8900",
        api_version="v1",
    )

    # make sure that you have PRIVATE_KEY in .env so the blockchain provider can load it
    blockchain_provider = AsyncBlockchainProvider(
        Environments.DEVELOPMENT.value,
        BlockchainIds.HARDHAT_1.value,
    )

    dkg = AsyncDKG(
        node_provider,
        blockchain_provider,
        config={"max_number_of_retries": 300, "frequency": 2},
    )
    
if __name__ == "__main__":
    asyncio.run(main())
```

{% hint style="warning" %}
Make sure to create an .env file and add the PRIVATE\_KEY variable to it so that the blockchain provider can pick it up.
{% endhint %}

### Blockchain networks

The system supports multiple blockchain networks, which can be configured using the `BlockchainIds` constants. You can select the desired blockchain by specifying the corresponding constant. The available options are:

**DKG mainnet options:**

* Base: base:8453
* Gnosis: gnosis:100
* Neuroweb: otp:2043

**DKG testnet options:**

* Base: base:84532
* Gnosis: gnosis:10200
* Neuroweb: otp:20430

**DKG devnet options:**

* Base: base:84532
* Gnosis: gnosis:10200
* Neuroweb: otp:2160

**Local options:**

* Hardhat1: hardhat1:31337
* Hardhat2: hardhat2:31337

## Create a Knowledge Collection

In this example, let’s create an example Knowledge Collection representing a city. The content contains both public and private assertions. Public assertions will be exposed publicly (replicated to other nodes), while private ones won't (stay on the node you published to only). If you have access to the particular node that has the data, when you search for it using get or query, you will see both public and private assertions.

```python
const content = {
     public: {
            '@context': 'http://schema.org',
            '@id': 'https://en.wikipedia.org/wiki/New_York_City',
            '@type': 'City',
            name: 'New York',
            state: 'New York',
            population: '8,336,817',
            area: '468.9 sq mi',
     },
     private: {
        '@context': 'http://schema.org',
        '@id': 'https://en.wikipedia.org/wiki/New_York_City',
        '@type': 'CityPrivateData',
        crimeRate: 'Low',
        averageIncome: '$63,998',
        infrastructureScore: '8.5',
        relatedCities: [
            { '@id': 'urn:us-cities:info:los-angeles', name: 'Los Angeles' },
            { '@id': 'urn:us-cities:info:chicago', name: 'Chicago' },
        ],
     },
}
```

When you create the Knowledge Collection, the above JSON-LD object will be converted into an **assertion**. When an assertion with public data is prepared, we can create a Knowledge Asset on the DKG. `epochs_number` specifies how many epochs the asset should be kept for (an epoch is equal to three months).

```python
create_asset_result = await dkg.asset.create(
    content=content,
    options={
        "epochs_num": 2,
        "minimum_number_of_finalization_confirmations": 3,
        "minimum_number_of_node_replications": 1
    },
)
print(create_asset_result)

```

{% hint style="warning" %}
To use the synchronous version, just remove the await (this applies to any function call you see in the rest of this document)
{% endhint %}

The complete response of the method will look like:

```python
{
    "UAL": "did:dkg:otp:2043/0x8f678eb0e57ee8a109b295710e23076fa3a443fe/572238",
    "datasetRoot": "0xd7a2dd6d747d2f8d2d0f76cc6fa04ebf383a368249cc24a701788f271a41df4d",
    "signatures": [
        {
            "identityId": 131,
            "v": 28,
            "r": "0x583598a701e4c54a1e47e6ff2f0cf0a9660d1749f3e413408ccd3ff5ca2288dc",
            "s": "0x131c07215977c4d681dc30cc32d9e8c1644825b932fb72cf035bb62f0963d2a5",
            "vs": "0x931c07215977c4d681dc30cc32d9e8c1644825b932fb72cf035bb62f0963d2a5"
        },
    ],
    "operation": {
        "mintKnowledgeAsset": {
            "transactionHash": "0x04efacfc576578836c6736f376d23930bb01accd38df31414ff7b5e35861d8f2",
            "transactionIndex": 1,
            "blockHash": "0x98bf84f7cb05f5742213ed305d9e99b59f6c874b6abf10312fc5062bc32f14ac",
            "from": "0x0E1405adD312D97d1a0A4fAA134C7113488D6ceA",
            "to": "0xc8cf8064d7fc7cF42d51Ca5B28218472157F3d90",
            "blockNumber": 7459414,
            "cumulativeGasUsed": 572870,
            "gasUsed": 537962,
            "contractAddress": null,
            "logs": [
             ],
            "logsBloom": "0x000002000000000000000000000000000000000000000000000008004000000000008000000000080000000000000000000000000000000000000000000c0000000000000008000008000008000000000040000000042000004000000000200000000000020100000000000000000808000000000802828000000010000000004000000000000000000000200000000000000000000000000000000200000000000000000000000002001a00000000000000000000000000080000000000001100000042000000000000000000040000000400000001000000000000000060000000080000000000020000000000010000000000000000000000000802000000",
            "status": 1,
            "effectiveGasPrice": 8,
            "type": 2
        },
        "publish": {
            "operationId": "a1709e45-0a0e-44c8-8c67-19edb4baefaa",
            "status": "COMPLETED"
        },
        "finality": {
            "status": "FINALIZED"
        },
        "numberOfConfirmations": 6,
        "requiredConfirmations": 3
    }
}

```

## Read Knowledge Asset data from the DKG

To read Knowledge Asset data from the DKG, we utilize the **get** protocol operation.

In this example, we will get the latest state of the Knowledge Asset we published previously:

```python
ual = create_asset_result.get("did:dkg:otp:2043/0x8f678eb0e57ee8a109b295710e23076fa3a443fe/572238")

get_asset_result = await dkg.asset.get(ual)

print(get_asset_result)
```

The response of the get operation will be the assertion graph:

```python
{
    "assertion": [
        {
            "@id": "https://ontology.origintrail.io/dkg/1.0#metadata-hash:0x5cb6421dd41c7a62a84c223779303919e7293753d8a1f6f49da2e598013fe652",
            "https://ontology.origintrail.io/dkg/1.0#representsPrivateResource": [
                {
                    "@id": "uuid:a7a27a50-7180-4949-b9d7-48ab931b9650"
                }
            ]
        },
        {
            "@id": "https://ontology.origintrail.io/dkg/1.0#metadata-hash:0x6a2292b30c844d2f8f2910bf11770496a3a79d5a6726d1b2fd3ddd18e09b5850",
            "https://ontology.origintrail.io/dkg/1.0#representsPrivateResource": [
                {
                    "@id": "uuid:43e30a8d-fc1e-41e1-a4b4-4d419c21108a"
                }
            ]
        },
        {
            "@id": "https://ontology.origintrail.io/dkg/1.0#metadata-hash:0xc1f682b783b1b93c9d5386eb1730c9647cf4b55925ec24f5e949e7457ba7bfac",
            "https://ontology.origintrail.io/dkg/1.0#representsPrivateResource": [
                {
                    "@id": "uuid:eec71df5-bb62-48cb-b196-9804aff60f51"
                }
            ]
        },
        {
            "@id": "urn:us-cities:info:new-york",
            "http://schema.org/name": [
                {
                    "@value": "New York"
                }
            ],
            "http://schema.org/area": [
                {
                    "@value": "468.9 sq mi"
                }
            ],
            "http://schema.org/population": [
                {
                    "@value": "8,336,817"
                }
            ],
            "http://schema.org/state": [
                {
                    "@value": "New York"
                }
            ],
            "@type": [
                "http://schema.org/City"
            ]
        },
        {
            "@id": "uuid:e63489c8-618b-494c-8fbb-f22ab0537b89",
            "https://ontology.origintrail.io/dkg/1.0#privateMerkleRoot": [
                {
                    "@value": "0xaac2a420672a1eb77506c544ff01beed2be58c0ee3576fe037c846f97481cefd"
                }
            ]
        }
    ],
    "operation": {
        "get": {
            "operationId": "9918220b-5175-44c3-b43a-3544610be560",
            "status": "COMPLETED"
        }
    }
}


```

## Querying Knowledge Asset data with SPARQL

Querying the DKG is done by using the SPARQL query language, which is very similar to SQL applied to graph data.

_(If you have SQL experience, SPARQL should be relatively easy to get started with. More information_[ _can be found here_](https://www.w3.org/TR/rdf-sparql-query/)_)._

Let’s write a simple query to select all subjects and objects in the graph that have the **Model** property of Schema.org context:

```python
query_operation_result = await dkg.graph.query(
    """
    PREFIX SCHEMA: <http://schema.org/>
    SELECT ?s ?stateName
    WHERE {
        ?s schema:state ?stateName .
    }
    """
)

print(query_graph_result)
```

The returned response will contain an array of n-quads:

```python
{
  "status": "COMPLETED",
  "data": [
    {
      "s": "urn:us-cities:info:new-york",
      "stateName": "\"New York\""
    }
  ]
}
```

As the OriginTrail node leverages a fully fledged graph database (a triple store supporting RDF), you can run arbitrary SPARQL queries on it.

To learn more about querying the DKG, go [here](../../querying-the-dkg.md).

## **More on types of interaction with the DKG SDK**

We can divide operations done by SDK into 3 types:

* Node API request
* Smart contract call (non-state-changing interaction)
* Smart contract transaction (state-changing interaction)

Non-state-changing interactions with smart contracts are free and can be described as contract-getters. They don’t require transactions on the blockchain. This means they do not incur transaction fees.

Smart contract transactions are state-changing operations. This means they change the state of the smart contract memory, which requires some blockchain-native gas tokens (such as ETH, NEURO, etc.).

To perform state-changing operations, you need to use a wallet funded with gas tokens.

You can use the default keys from the example below for the Hardhat blockchain:

```python
PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
```

{% hint style="warning" %}
The default keys above should not be used anywhere except in a local development environment.
{% endhint %}
