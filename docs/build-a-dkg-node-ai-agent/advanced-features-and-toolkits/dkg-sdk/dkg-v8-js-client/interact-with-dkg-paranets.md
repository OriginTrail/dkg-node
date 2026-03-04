---
cover: ../../../../.gitbook/assets/dkg-js-banner.jpg
coverY: 0
---

# Interact with DKG paranets

The DKG JavaScript SDK provides functionality for interacting with paranets on the OriginTrail Decentralized Knowledge Graph (DKG). This section of the SDK allows developers to create, manage, and utilize paranets effectively.

## Setup and installation

To interact with paranets, you need to connect to a running OriginTrail node (either local or remote) and ensure you have the dkg.js SDK installed and properly configured.&#x20;

Follow the general setup instructions for [installing dkg.js](./) and read more about paranets [in the following section](../../dkg-paranets/).

### Creating a paranet

Before creating a paranet, you must first create a knowledge collection (KC) on the DKG and choose a Knowledge Asset (KA) from that KC that will represent the paranet. To create a knowledge collection on the DKG, refer to [the following page](./).

{% hint style="info" %}
**Knowledge collection (KC)** is a **collection of Knowledge Assets (KA).** It refers to structured data that can be stored, shared, and validated within a distributed network.
{% endhint %}

Once the knowledge collection is created, you can choose which KA from that KC will represent a paranet. KA will have a unique identifier known as a Universal Asset Locator (UAL). You will use this UAL to create a paranet. The paranet creation process essentially links the paranet to the Knowledge Asset, establishing it on the blockchain. This on-chain representation allows for decentralized management and interaction with the paranet.

Here is an example of how to create a new paranet using the `create` function from the paranet module. This function requires the UAL of the previously created Knowledge Asset, along with other details such as the paranet's name and description:

```javascript
const kcUAL =
  "did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1";
const kaUAL = `${kcUAL}/1`;
await dkg.paranet.create(kaUAL, {
  paranetName: "AiParanet",
  paranetDescription: "AI agents paranet for demonstration purposes.",
  paranetNodesAccessPolicy: PARANET_NODES_ACCESS_POLICY.OPEN,
  paranetMinersAccessPolicy: PARANET_MINERS_ACCESS_POLICY.OPEN,
  paranetKcSubmissionPolicy: PARANET_KC_SUBMISSION_POLICY.PERMISSIONED,
});
```

In this example:

- `kaUAL` is the unique identifier of the Knowledge Asset created on the DKG.
- `paranetName` is the name you want to give to your paranet. It should be descriptive enough to indicate the paranet's purpose or focus.
- `paranetDescription` provides additional context about the paranet, explaining its purpose and the types of knowledge collections or services it will involve.
- `paranetNodesAccessPolicy` defines a paranet's policy towards including nodes. If OPEN, any node can be a part of the paranet.
- `paranetMinersAccessPolicy` defines a paranet's policy towards including knowledge miners. If OPEN, anyone can publish to a paranet.&#x20;
- `paranetKcSubmissionPolicy` defines a paranet's policy regarding which KCs can be added and who can add new collections of Knowledge Assets. To learn more about curation, [read here](knowledge-submission-and-curation.md). If OPEN, anyone can access a paranet.&#x20;

After the paranet is successfully created, the paranet UAL can be used to interact with the paranet. This includes deploying services within the paranet, managing incentives, and claiming rewards associated with the paranet's operations.

### Adding services to a paranet

Enhance the capabilities of your paranet by integrating new services. The `addServices` function allows you to add both on-chain and off-chain services to your paranet. These services can range from AI agents and data oracles to decentralized knowledge interfaces and more.

Before adding services, you first need to create them using the `createService` function. Services added to a paranet can either have on-chain addresses, representing smart contracts or other on-chain entities, or they can be off-chain services, which do not have associated blockchain addresses.

Each service can be identified by all paranet users via its registry Knowledge Asset and can include multiple on-chain accounts under its control. This enables services to participate in economic activities within the DKG.

```javascript
const paranetUAL =
  "did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1/1";
const serviceUAL =
  "did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/2/1";
await dkg.paranet.createService(serviceUAL, {
  paranetServiceName: "MyAiService",
  paranetServiceDescription: "Autonomous AI service for AI paranet",
  paranetServiceAddresses: [
    "0xb3155543738b997b7a1a5bc849005bc2afd35578",
    "0x2375e543738b997b7a125bc849005b62afd35571",
  ],
});

const serviceUALs = [serviceUAL];
await dkg.paranet.addServices(paranetUAL, serviceUALs);
```

In this example:

- `paranetServiceName` specifies the name of the service.
- `paranetServiceDescription` provides a brief description of what the service does.
- `paranetServiceAddresses` lists blockchain addresses associated with the service. For off-chain services, this field can be left empty.
- `serviceUALs` is an array of UALs that are used to register services you want to add to your Paranet.&#x20;

By integrating and managing services, paranet operators can expand the capabilities of their paranet, providing a robust infrastructure for decentralized applications and AI-driven services.

## Knowledge mining for open paranets

Paranets allow users to leverage collective intelligence by contributing their knowledge collections, enhancing the network's overall utility and value.&#x20;

**Submitting existing knowledge collections to a paranet**

Once you create a knowledge collection, you can submit it to a paranet using the `dkg.asset.submitToParanet` function.&#x20;

Here’s an example:

```javascript
const paranetUAL =
  "did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1/1";
const kcUAL =
  "did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/55";

// Submit a Knowledge Collection to a paranet
await DkgClient.asset.submitToParanet(kcUAL, paranetUAL);
```

## Checking and claiming rewards

Participants in an incentivized paranet can earn rewards for their various roles and contributions, such as knowledge mining, voting on proposals, or operating the paranet. The dkg.js library provides functions to check if an address has a specific role within the paranet and to claim rewards associated with that role.

If you're interested in deploying a **paranet's incentive pool**, you can find more details and guidelines at this [link](../../dkg-paranets/initial-paranet-offerings-ipos/paranets-incentives-pool.md).

**Roles in a paranet:**

- **Knowledge miners:** Contribute to the paranet by mining knowledge collections.
- **Paranet operators:** Manage the paranet, including overseeing services and facilitating operations.
- **Proposal voters:** Participate in decision-making by voting on the Initial Paranet Offering (IPO).

Participants can verify their roles and claim rewards through the following steps and examples:

<pre class="language-javascript"><code class="lang-javascript">const paranetUAL = 'did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1/1';

const incentivesPoolOptions = {
        tracToTokenEmissionMultiplier: 5,
        operatorRewardPercentage: 10.0,
        incentivizationProposalVotersRewardPercentage: 12.0,
        incentivesPoolName: 'YourIncentivesPoolName',
        rewardTokenAddress: '0x0000000000000000000000000000000000000000', // the native token for the chosen network
 };
 
 // Deploys the incentives contract to the Paranet using the defined options and prints the deployment result.
 const paranetDeployed = await DkgClient.paranet.deployIncentivesContract(paranetUAL, incentivesPoolOptions);
    console.log('======================== PARANET INCENTIVES POOL DEPLOYED');
    console.log(paranetDeployed);
    divider();

// Retrieves and logs all existing incentives pools within the Paranet ecosystem.
const allIncentivesPools = await DkgClient.paranet.getAllIncentivesPools(paranetUAL);
    console.log('======================== ALL PARANET INCENTIVES POOLS');
    console.log(allIncentivesPools);
    divider();

// Fetches and displays the storage address of the deployed incentives pool based on its name and address.
const incentivesPoolStorageAddressResult = await DkgClient.paranet.getIncentivesPoolStorageAddress(paranetUAL, { incentivesPoolName: incentivesPoolOptions.incentivesPoolName, incentivesPoolAddress: paranetDeployed.incentivesPoolAddress});
    console.log('======================== PARANET INCENTIVES POOL STORAGE ADDRESS');
    console.log(incentivesPoolStorageAddressResult);
    divider();
    
// Check if an address is a knowledge miner
const isMiner = await dkg.paranet.isKnowledgeMiner(paranetUAL, { roleAddress: '0xMinerAddress', incentivesPoolName: incentivesPoolOptions.incentivesPoolName});
console.log('Is Knowledge Miner:', isMiner);

// Check if an address is a paranet operator
const isOperator = await dkg.paranet.isParanetOperator(paranetUAL, { incentivesPoolName: incentivesPoolOptions.incentivesPoolName});
console.log('Is Paranet Operator:', isOperator);
<strong>
</strong><strong>// Check if an address is a voter
</strong>const isVoter = await dkg.paranet.isProposalVoter(paranetUAL, { roleAddress: '0xVoterAddress', incentivesPoolName: incentivesPoolOptions.incentivesPoolName});
console.log('Is Proposal Voter:', isVoter);

// Check claimable Knowledge miner rewards
const claimableMinerRewards = await dkg.paranet.getClaimableMinerReward(paranetUAL, { incentivesPoolName: incentivesPoolOptions.incentivesPoolName});
console.log('Claimable Miner Reward:', claimableMinerRewards);

// Claim miner rewards
await dkg.paranet.claimMinerReward(paranetUAL, claimableMinerRewards, { incentivesPoolName: incentivesPoolOptions.incentivesPoolName});
console.log('Miner rewards claimed successfully!');

// Check claimable operator rewards
const claimableVoterRewards = await dkg.paranet.getClaimableVoterReward(paranetUAL, { incentivesPoolName: incentivesPoolOptions.incentivesPoolName});
console.log('Claimable Voter Reward:', claimableVoterRewards);

// Claim voter rewards
await dkg.paranet.claimVoterReward(paranetUAL, { incentivesPoolName: incentivesPoolOptions.incentivesPoolName});
console.log('Voter rewards claimed successfully!');

// Check claimable operator rewards
const claimableOperatorRewards = await dkg.paranet.getClaimableOperatorReward(paranetUAL, { incentivesPoolName: incentivesPoolOptions.incentivesPoolName});
console.log('Claimable Operator Reward:', claimableOperatorRewards);

// Claim operator rewards
await dkg.paranet.claimOperatorReward(paranetUAL, { incentivesPoolName: incentivesPoolOptions.incentivesPoolName});
console.log('Operator rewards claimed successfully!');
</code></pre>

By following these steps, you can effectively check your role and claim the rewards you have earned for contributing to the paranet.&#x20;

This system ensures that all participants are fairly compensated for their efforts, promoting a robust and active community within the paranet.

{% hint style="info" %}
To learn more about **managing the submission and approval process for knowledge collections (KC) in a paranet,** refer to the [Knowledge submission & curation](knowledge-submission-and-curation.md) page. &#x20;
{% endhint %}

## Performing SPARQL queries on a specific paranet

The DKG enables users to perform SPARQL queries on specific paranets. By specifying a paranet, users can target their queries to retrieve data related to that paranet. This can be particularly useful when working with domain-specific data or services within a paranet.

To query a specific paranet, ensure that the node you are querying already has paranet syncing enabled for the paranet you wish to query. Without this setup, the node may not have the relevant data required to process your queries.[ ](../../dkg-paranets/syncing-a-dkg-paranet.md)

[Read here](../../dkg-paranets/syncing-a-dkg-paranet.md) how to set up a node to sync a paranet.

To query a specific paranet, you have to specify the paranet UAL using the `paranetUAL` parameter. This approach allows you to direct your queries to the paranet that holds the relevant data.

Here’s how you can perform a query on a specific paranet using the `paranetUAL` parameter:

```javascript
const paranetUAL =
  "did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1/1";
const queryWhereMadrid = `PREFIX schema: <http://schema.org/>
        SELECT DISTINCT ?graphName
        WHERE {
          GRAPH ?graphName {
            ?s schema:city <uuid:Madrid> .
        }
}`;

let queryResult = await dkg.graph.query(queryWhereMadrid, "SELECT", {
  paranetUAL: paranetUAL,
});

console.log(queryResult.data);
```

By querying specific paranets, you can leverage the powerful capabilities of the DKG to interact with domain-specific collections of knowledge and services, ensuring that your queries are targeted and efficient. This makes it easier to work with complex data structures and gain insights from your paranet's knowledge collections.

### Federated SPARQL queries

Federated SPARQL queries allow users to execute queries across the whole knowledge graph and paranets simultaneously. In the context of the DKG, a node might sync with multiple paranets. Federated queries allow you to query multiple paranets within a single SPARQL query, accessing data from each specified paranet and merging the results.

Imagine you have a DKG node(ot-node) that synchronizes with three different paranets. You want to perform a query that targets two of these paranets to retrieve data about users and cities. Federated SPARQL queries provide a convenient way to specify which paranets to include in your query.

If you need to query data across multiple specified paranets, you should use federated SPARQL queries. However, if you want to query all available paranets, you do not need to provide any specific arguments, as all paranets will be queried by default using the default triple store repository.

To execute a federated SPARQL query, you can use the `SERVICE` keyword to specify the paranet UALs you want to query. This keyword allows you to include data from different sources in your query.

Here’s an example of a federated query targeting two out of three paranets:

```javascript
const federatedQuery = `
    PREFIX schema: <http://schema.org/>
        SELECT DISTINCT ?s ?city1 ?user1 ?s2 ?city2 ?user2 ?company1
        WHERE {
          ?s schema:city ?city1 .
          ?s schema:company ?company1 .
          ?s schema:user ?user1;
        
          SERVICE <${paranetUAL3}> {
            ?s2 schema:city <uuid:Belgrade> .
            ?s2 schema:city ?city2 .
            ?s2 schema:user ?user2;
          }
        
          filter(contains(str(?city2), "Belgrade"))
        }
    `;

queryResult = await dkg.graph.query(federatedQuery, "SELECT", {
  paranetUAL: paranetUAL1,
});

console.log(queryResult.data);
```

**Explanation:**

- **`SERVICE` keyword:** The `SERVICE` keyword is used to include data from Paranet 3 (`paranetUAL3`) in the query, while the primary paranet is set to Paranet 1 (`paranetUAL1`).
- **Query structure:** The query retrieves distinct subjects (`?s`), cities, users, and companies from Paranet 1, and performs a sub-query within Paranet 3 to get data on where the city is `Belgrade`.
- **Filter clause:** The `filter` clause is used to ensure that the city data from Paranet 3 contains the string "Belgrade".

Federated SPARQL queries provide a powerful way to aggregate and analyze data across multiple paranets. This enables more complex data retrieval and cross-paranet data integration, making it easier to gather comprehensive insights from diverse data sources.
