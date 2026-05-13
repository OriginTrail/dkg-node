---
description: Javascript library for the Decentralized Knowledge Graph.
---

# DKG Javascript SDK (dkg.js)

If you are looking to build applications leveraging [Knowledge Assets](./#create-a-knowledge-asset) on the OriginTrail Decentralized Knowledge Graph (DKG), the dkg.js SDK library is the best place to start!

The DKG SDK is used together with an **OriginTrail gateway node** to build applications that interface with the OriginTrail DKG (the node is a dependency). Therefore, to use the SDK, you either need to run a gateway node on [your local environment](../setting-up-your-development-environment.md) or a [hosted DKG Node](../../../../getting-started/decentralized-knowledge-graph-dkg.md).

## Prerequisites

* node ≥ 20.0.0
* npm ≥ 8.0.0

## Installation

The library can be used either in the browser or in a NodeJS application.

### Using dkg.js in the browser

Use the prebuilt `dist/dkg.min.js`, or build the file on your own using the[ dkg.js](https://github.com/OriginTrail/dkg.js) repository:

```
npm run build
```

Then include `dist/dkg.min.js` in your html file. This will expose `DKG` on the window object:

```javascript
<script src='https://cdn.jsdelivr.net/npm/web3@latest/dist/web3.min.js'></script>
<script src='./dist/dkg.min.js'></script>
<script>
   window.addEventListener('load', async function () {
       // DKG object is available here
   });
</script>
```

{% hint style="info" %}
Make sure to also include the **web3.js library**, as it is a dependency for dkg.js.
{% endhint %}

### Using dkg.js in NodeJS apps

Run the command to install the dependency from the [NPM](https://www.npmjs.com/package/dkg.js) repository:

```bash
npm install dkg.js@latest
```

Then, include `dkg.js` in your project files. This will expose the `DKG` object:

```javascript
const DKG = require('dkg.js');
```

## :snowboarder: Quickstart

{% embed url="https://youtu.be/4oi_0hJmxcY?si=SD7GUy35mtovBiPW" %}
OriginTrail dev tutorial: SDK walkthrough
{% endembed %}

To use the DKG library, you need to connect to a running local or remote OT-node.

```javascript
const dkg = new DKG({
    environment: ENVIRONMENTS.DEVELOPMENT, // or devnet, testnet, mainnet
    endpoint: 'http://localhost',  // gateway node URI
    port: 8900,
    blockchain: {
        name: BLOCKCHAIN_IDS.HARDHAT_1, // or any other blockchain id
        publicKey: PUBLIC_KEY, // not required in browser, metamask used instead
        privateKey: PRIVATE_KEY, // not required in browser, metamask used instead
    },
});

const nodeInfo = await dkg.node.info(); 
// if successfully connected, the will return an object indicating the node version
// { 'version': '8.X.X' }
```

The system supports multiple blockchain networks, which can be configured using the BLOCKCHAIN\_IDS constants. You can select the desired blockchain by specifying the corresponding constant. The available options are:

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

The system uses default publicly available RPCs for each chain. However, because these RPCs are shared by many users, they can become overloaded, leading to errors — such as failures when creating a KA. To avoid this, we recommend using your own RPC if possible. You can set a custom RPC by passing `rpc: RPC_URL` in the blockchain options.

## Create a Knowledge Asset

In this example, let’s create an example Knowledge Asset representing a city. The content contains both public and private assertions. Public assertions will be exposed publicly (replicated to other nodes), while private ones won't (stay on the node you published to only).

If you have access to the particular node that has the data, when you search for it using get or query, you will see both public and private assertions.

```javascript
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

When you create the Knowledge Asset, the above JSON-LD object will be converted into an **assertion**. When an assertion with public data is prepared, we can create a Knowledge Asset on the DKG. `epochsNum` specifies how many epochs the asset should be kept for (an epoch is equal to one month).

```javascript
const result = await DkgClient.asset.create(content, {
        epochsNum: 6
});

console.log(result);
```

The complete response of the method will look like:

```javascript
{
    "UAL": "did:dkg:base:84532/0xd5550173b0f7b8766ab2770e4ba86caf714a5af5/10310",
    "datasetRoot": "0x09d732838cb1e4ff56a080d58d2b50fd8383ef66c783655a80cd7522b80b53df",
    "signatures": [
        ...
    ],
    "operation": {
        "mintKnowledgeAsset": {
            "blockHash": "0x729fbb3bb2852dbc51a6996ae03aed27cebb987b51ec8a3da65e642749b70b74",
            "blockNumber": 20541620,
            "contractAddress": null,
            "cumulativeGasUsed": 1680639,
            "effectiveGasPrice": 1026844,
            "from": "0x0e1405add312d97d1a0a4faa134c7113488d6cea",
            "gasUsed": 530457,
            "l1BaseFeeScalar": "0x44d",
            "l1BlobBaseFee": "0x20fbab8dde",
            "l1BlobBaseFeeScalar": "0xa118b",
            "l1Fee": "0x6b3eb30359ac",
            "l1GasPrice": "0x411f05c9f",
            "l1GasUsed": "0x4e95",
            "logs": [
               ...
            ],
            "logsBloom": "0x00000200000000000000000000000000000000000000000000000000400000000000800000000000000000000000000000000000000000000000000000240000000000800000000000000008000000000000000000042800004000000000000008000000020000000000000100000808000000004800040010040010000000004000000800000020001000000000000000000002000000000000010000000000020000000000000000000a000000000000000000000000000820000020000011000000020020000000000000000000000004000084410000000000000000e0000010000000000000020000000000000000000000000000000000000802000000",
            "status": true,
            "to": "0x46121121f78f8351da4526813fbfbffd044dec6c",
            "transactionHash": "0x1a9f6b954c2149fb03d6adec21ca7b0829a4d84b3bc93fad62291fcbeb74aace",
            "transactionIndex": 10,
            "type": "0x0"
        },
        "publish": {
            "operationId": "6f6a0960-e577-43ef-88c9-04e0314347c5",
            "status": "PUBLISH_REPLICATE_END"
        },
        "finality": { "status": "FINALIZED" },
        "numberOfConfirmations": 3,
        "requiredConfirmations": 3
    }
}
```

If you want to create multiple different assets, you can increase your allowance. Then, each time you initiate a publish, the step of calling the blockchain to increase your allowance will be skipped, resulting in a faster publishing time.

```javascript
await dkg.asset.increaseAllowance('1569429592284014000');

const result = await DkgClient.asset.create(content, {
        epochsNum: 6
});
```

After you've finished publishing data to the blockchain, you can decrease your allowance to revoke the authorization given to the contract to spend your tokens. If you want to revoke all remaining authorization, it's a good practice to pass the same value that you used for increasing your allowance.

```javascript
await dkg.asset.decreaseAllowance('1569429592284014000');
```

## Read Knowledge Asset data from the DKG

To read Knowledge Asset data from the DKG, we utilize the **get** protocol operation.

In this example, we will get the latest state of the Knowledge Asset we published previously:

```javascript
const { UAL } = result;

const getAssetResult = await dkg.asset.get(UAL);

console.log(JSON.stringify(getAssetResult, null, 2));
```

The response of the get operation will be the assertion graph:

```javascript
{
  "assertion": [
    {
      "@id": "https://ontology.origintrail.io/dkg/1.0#metadata-hash:0x5cb6421dd41c7a62a84c223779303919e7293753d8a1f6f49da2e598013fe652",
      "https://ontology.origintrail.io/dkg/1.0#representsPrivateResource": [
        {
          "@id": "uuid:e8edba11-5c95-4b02-941b-b662220c4be8"
        }
      ]
    },
    {
      "@id": "https://ontology.origintrail.io/dkg/1.0#metadata-hash:0x6a2292b30c844d2f8f2910bf11770496a3a79d5a6726d1b2fd3ddd18e09b5850",
      "https://ontology.origintrail.io/dkg/1.0#representsPrivateResource": [
        {
          "@id": "uuid:51e3c267-096f-4ff9-b963-bd48f2b0a210"
        }
      ]
    },
    {
      "@id": "https://ontology.origintrail.io/dkg/1.0#metadata-hash:0xc1f682b783b1b93c9d5386eb1730c9647cf4b55925ec24f5e949e7457ba7bfac",
      "https://ontology.origintrail.io/dkg/1.0#representsPrivateResource": [
        {
          "@id": "uuid:4b6065d0-7ed3-4b37-af44-7e202510fd44"
        }
      ]
    },
    {
      "@id": "urn:us-cities:data:new-york",
      "http://schema.org/averageIncome": [
        {
          "@value": "$63,998"
        }
      ],
      "http://schema.org/crimeRate": [
        {
          "@value": "Low"
        }
      ],
      "http://schema.org/infrastructureScore": [
        {
          "@value": "8.5"
        }
      ],
      "http://schema.org/relatedCities": [
        {
          "@id": "urn:us-cities:info:chicago"
        },
        {
          "@id": "urn:us-cities:info:los-angeles"
        }
      ],
      "@type": [
        "http://schema.org/CityPrivateData"
      ]
    },
    {
      "@id": "urn:us-cities:info:chicago",
      "http://schema.org/name": [
        {
          "@value": "Chicago"
        }
      ]
    },
    {
      "@id": "urn:us-cities:info:los-angeles",
      "http://schema.org/name": [
        {
          "@value": "Los Angeles"
        }
      ]
    },
    {
      "@id": "https://en.wikipedia.org/wiki/New_York_City",
      "http://schema.org/name": [
        {
          "@value": "New York"
        }
      ],
      "http://schema.org/state": [
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
      "@type": [
        "http://schema.org/City"
      ]
    },
    {
      "@id": "uuid:bb6841b5-ff3d-4c91-aed6-4d2e7726b5a9",
      "https://ontology.origintrail.io/dkg/1.0#privateMerkleRoot": [
        {
          "@value": "0xaac2a420672a1eb77506c544ff01beed2be58c0ee3576fe037c846f97481cefd"
        }
      ]
    }
  ],
  "operation": {
    "get": {
      "operationId": "171045d8-3adc-4d23-832e-6c1c9cb1d612",
      "status": "COMPLETED"
    }
  }
}

```

## Querying Knowledge Asset data with SPARQL

Querying the DKG is done by using the SPARQL query language, which is very similar to SQL applied to graph data.

_(If you have SQL experience, SPARQL should be relatively easy to get started with. More information_[ _can be found here_](https://www.w3.org/TR/rdf-sparql-query/)_)._

Let’s write a simple query to select all subjects and objects in the graph that have the **State** property of Schema.org context:

```javascript
const result = await dkg.graph.query(
    `prefix schema: <http://schema.org/>
        select ?s ?stateName
        where {
            ?s schema:state ?stateName
        }`,
    'SELECT',
);

console.log(JSON.stringify(result, null, 2));
```

The returned response will contain an array of n-quads:

<pre class="language-javascript"><code class="lang-javascript">{
  "status": "COMPLETED",
  "data": [
    {
        s: 'https://en.wikipedia.org/wiki/New_York_City', 
<strong>        stateName: '"New York"'
</strong>    }
  ]
}
</code></pre>

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

```javascript
const PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const PUBLIC_KEY="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
```

{% hint style="warning" %}
The default keys above should not be used anywhere except in a local development environment.
{% endhint %}
