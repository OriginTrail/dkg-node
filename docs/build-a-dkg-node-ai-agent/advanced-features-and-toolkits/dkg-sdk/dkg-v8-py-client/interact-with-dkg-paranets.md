---
hidden: true
---

# Interact with DKG paranets

{% hint style="danger" %}
**Paranets are not currently supported in the DKG V8. Expect the support to be back latest by the end of February.**
{% endhint %}

The DKG Python SDK provides functionality for interacting with paranets on the OriginTrail Decentralized Knowledge Graph (DKG). This section of the SDK allows developers to create, manage, and utilize paranets effectively.

## Setup and installation

To interact with paranets, you need to connect to a running OriginTrail node (either local or remote) and ensure you have the dkg.py SDK installed and properly configured. Follow the general setup instructions for [installing dkg.py](./) and read more about paranets [in the following section](../../dkg-paranets/).

### Creating a paranet

Before creating a paranet, you must first create a Knowledge Collection (KC) on the DKG and choose a Knowledge Asset (KA) from that KC that will represent the paranet. To create a Knowledge Asset on the DKG, refer to [the following page](./).

Once the Knowledge Collection is created, you can choose which KA from that KC will represent a paranet. KA will have a unique identifier known as a Universal Asset Locator (UAL). You will use this UAL to create a paranet. The paranet creation process essentially links the paranet to the Knowledge Asset, establishing it on the blockchain. This on-chain representation allows for decentralized management and interaction with the paranet.

Here is an example of how to create a new paranet using the `create` function from the paranet module. This function requires the UAL of the previously created Knowledge Asset, along with other details such as the paranet's name and description:

```python
kc_ual = 'did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1'
ka_ual = f"{kc_ual}/1"
options = {
    "paranet_name": "TestParanet",
    "paranet_description": "TestParanetDescription",
    "paranet_nodes_access_policy": ParanetNodesAccessPolicy.CURATED,
    "paranet_miners_access_policy": ParanetMinersAccessPolicy.CURATED
}

await dkg.paranet.create(paranet_ual, options)
```

{% hint style="warning" %}
To use the synchronous version, just remove the await (this applies to all function calls you will see in the rest of this document)

Asynchronous version setup guide can be found here: [async guide](./)
{% endhint %}

In this example:

- `ka_ual` is the unique identifier of the Knowledge Asset created on the DKG.
- `name` is the name you want to give to your paranet. It should be descriptive enough to indicate the paranet's purpose or focus.
- `description` provides additional context about the paranet, explaining its purpose and the types of Knowledge Assets or services it will involve.
- `paranet_nodes_access_policy` defines a paranet's policy towards including nodes. If OPEN, any node can be a part of the paranet. If CURATED, only the paranet owner can approve nodes to be a part of the paranet.
- `paranet_miners_access_policy` defines a paranet's policy towards including knowledge miners. If OPEN, anyone can publish to a paranet. If CURATED, only the paranet owner can approve knowledge miners who can publish to the paranet.

After the paranet is successfully created, the paranet UAL can be used to interact with the specific paranet. This includes deploying services within the paranet, managing incentives, and claiming rewards associated with the paranet's operations.

### Adding services to a paranet

Enhance the capabilities of your paranet by integrating new services. The `add_services` function allows you to add both on-chain and off-chain services to your paranet. These services can range from AI agents and data oracles to decentralized knowledge interfaces and more.

Before adding services, you first need to create them using the `create_service` function. Services added to a paranet can either have on-chain addresses, representing smart contracts or other on-chain entities, or they can be off-chain services, which do not have associated blockchain addresses.

Each service can be identified by all paranet users via its registry Knowledge Asset and can include multiple on-chain accounts under its control. This enables services to participate in economic activities within the DKG.

<pre class="language-python"><code class="lang-python">paranet_ual = 'did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1/1'
<strong>paranet_service_ual = 'did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/2/1'
</strong>options = {
    "paranet_service_name": "TestParanetService",
    "paranet_service_description": "TestParanetServiceDescription",
    "paranet_service_addresses": ["0x03C094044301E082468876634F0b209E11d98452"],
}

await dkg.paranet.create_service(paranet_service_ual, options)

await dkg.paranet.add_services(ual=paranet_ual, services_uals=[paranet_service_ual])
</code></pre>

In this example:

- `ual` specifies the UAL of the Paranet Service Knowledge Asset
- `paranet_service_name` specifies the name of the service.
- `paranet_service_description` provides a brief description of what the service does.
- `paranet_service_addresses` lists blockchain addresses associated with the service. For off-chain services, this field can be left empty.
- `services_uals` is an array of Universal Asset Locators for the services you want to add to your paranet.

By integrating and managing services, paranet operators can expand the capabilities of their paranet, providing a robust infrastructure for decentralized applications and AI-driven services.

## Knowledge mining for open paranets

Paranets allow users to leverage collective intelligence by contributing their Knowledge Collections or Knowledge Assets, enhancing the overall utility and value of the network.&#x20;

**Submitting existing Knowledge Collections or Knowledge Assets to a paranet**

Once you create a Knowledge Collection or a Knowledge Asset, you can submit it to a paranet using the `dkg.asset.submit_to_paranet` function. Here’s an example:

```python
paranet_ual = 'did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1/1'
kc_ual = 'did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/55'
ka_ual = 'did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/55/1'

# Submit a Knowledge Collection to a paranet
submit_kc_result = await dkg.asset.submit_to_paranet(kc_ual, paranet_ual)

# Submit a Knowledge Asset to a paranet
submit_ka_result = await dkg.asset.submit_to_paranet(ka_ual, paranet_ual)
```

## Checking and claiming rewards

Participants in a paranet can earn rewards for their various roles and contributions, such as knowledge mining, voting on proposals, or operating the paranet. The dkg.py library provides functions to check if an address has a specific role within the paranet and to claim rewards associated with that role.

**Roles in a paranet:**

- **Knowledge miners:** Contribute to the paranet by mining Knowledge Collections/Assets.
- **Paranet operators:** Manage the paranet, including overseeing services and facilitating operations.
- **Proposal voters:** Participate in decision-making by voting on the Initial Paranet Offering (IPO).

Participants can verify their roles and claim rewards through the following steps and examples:

<pre class="language-python"><code class="lang-python">paranet_ual = 'did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1'

# Check if an address is a knowledge miner
is_knowledge_miner = await dkg.paranet.is_knowledge_miner(ual=paranet_ual)

# Check if an address is a paranet operator
is_operator = await dkg.paranet.is_operator(ual=paranet_ual)
<strong>
</strong><strong># Check if an address is a voter
</strong>is_voter = await dkg.paranet.is_voter(ual=paranet_ual)

# Check claimable rewards
knowledge_miner_reward = await dkg.paranet.calculate_claimable_miner_reward_amount(ual=paranet_ual)
operator_reward = await dkg.paranet.calculate_claimable_operator_reward_amount(ual=paranet_ual)

print(f"Claimable Knowledge Miner Reward for the Current Wallet: {knowledge_miner_reward}")
print(f"Claimable Paranet Operator Reward for the Current Wallet: {operator_reward}")
if (is_voter):
    voter_rewards = await dkg.paranet.calculate_claimable_voter_reward_amount(ual=paranet_ual)
    print(f"Claimable Proposal Voter Reward for the Current Wallet: {voter_rewards}")

# Claim miner rewards
await dkg.paranet.claim_miner_reward(ual=paranet_ual)

# Claim operator rewards
await dkg.paranet.claim_operator_reward(ual=paranet_ual)

# Claim operator rewards
<strong>await dkg.paranet.claim_voter_reward(ual=paranet_ual)
</strong></code></pre>

By following these steps, you can effectively check your role and claim the rewards you have earned for contributing to the paranet.&#x20;

This system ensures that all participants are fairly compensated for their efforts, promoting a robust and active community within the p.

## Updating claimable rewards

In some cases, you may have already mined a Knowledge Collection/Asset to a specific paranet but decided to update the Knowledge Asset. By doing so, you become eligible for additional NEURO rewards (in the case when additional TRAC is spent for the update).&#x20;

To ensure that your claimable rewards reflect your new contributions, you need to call the `update_claimable_rewards` function for the paranet after the update finalization. This function updates your claimable reward amounts based on your latest contributions.

<pre class="language-python"><code class="lang-python">paranet_ual = 'did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1'

<strong>await dkg.paranet.update_claimable_rewards(ual=paranet_ual)
</strong></code></pre>

This function only updates the claimable rewards based on your latest contributions. To actually claim the rewards, use the respective claiming functions, such as `claim_miner_reward`, `claim_voter_reward`, or `claim_operator_reward`.

## Performing SPARQL queries on a specific paranet

The DKG enables users to perform SPARQL queries on specific paranets. By specifying a paranet, users can target their queries to retrieve data related to that paranet. This can be particularly useful when working with domain-specific data or services within a paranet.

To query a specific paranet, ensure that the node you are querying has already enabled paranet syncing for the paranet you wish to query. Without this setup, the node may not have the relevant data required to process your queries.[ ](../../dkg-paranets/syncing-a-dkg-paranet.md)

[Read here](../../dkg-paranets/syncing-a-dkg-paranet.md) how to set up a node to sync a paranet.

To query a specific paranet, you should set the `graph_location` to the desired paranet UAL. This approach allows you to direct your queries to the paranet that holds the relevant data.

Here’s how you can perform a query on a specific paranet:

```python
paranet_ual = 'did:dkg:hardhat1:31337/0x791ee543738b997b7a125bc849005b62afd35578/1/1'
query_where_madrid = """
PREFIX schema: <http://schema.org/>
SELECT DISTINCT ?graphName
WHERE {
        GRAPH ?graphName {
                ?s schema:city <uuid:Madrid> .
        }
}
"""

query_result = await dkg.graph.query(
        query=query_where_madrid, options={"paranet_ual": paranet_ual}
)

print(query_result)
```

By querying specific paranets, you can leverage the powerful capabilities of the DKG to interact with domain-specific Knowledge Collections, Knowledge Assets and services, ensuring that your queries are targeted and efficient. This makes it easier to work with complex data structures and gain insights from your paranet's Knowledge Collections and Knowledge Assets.

### Federated SPARQL queries

Federated SPARQL queries allow users to execute queries across multiple knowledge graphs or paranets simultaneously. In the context of the DKG, a node might sync with multiple paranets. Federated queries allow you to query multiple paranets within a single SPARQL query, accessing data from each specified paranet and merging the results.

Imagine you have a DKG node that synchronizes with three different paranets. You want to perform a query that targets two of these paranets to retrieve data about users and cities. Federated SPARQL queries provide a convenient way to specify which paranets to include in your query.

If you need to query data across multiple specified paranets, you should use federated SPARQL queries. However, if you want to query all available paranets, you do not need to provide any specific arguments, as all paranets will be queried by default using the default triple store repository.

To execute a federated SPARQL query, you can use the `SERVICE` keyword to specify the paranet UALs you want to query. This keyword allows you to include data from different sources in your query.

Here’s an example of a federated query targeting two out of three paranets:

```python
federated_query = """
PREFIX schema: <http://schema.org/>
SELECT DISTINCT ?s ?city1 ?user1 ?s2 ?city2 ?user2 ?company1
WHERE {{
  ?s schema:city ?city1 .
  ?s schema:company ?company1 .
  ?s schema:user ?user1;

  SERVICE <{paranet_ual3}> {{
    ?s2 schema:city <uuid:Belgrade> .
    ?s2 schema:city ?city2 .
    ?s2 schema:user ?user2;
  }}

  filter(contains(str(?city2), "Belgrade"))
}}
"""

query_result = await dkg.graph.query(
    query=federated_query, options={"paranet_ual": paranet_ual1}
)

print(query_result)
```

**Explanation:**

- **`SERVICE` keyword:** The `SERVICE` keyword is used to include data from Paranet 3 (`paranet_ual3`) in the query, while the primary paranet is set to Paranet 1 (`paranet_ual1`).
- **Query structure:** The query retrieves distinct subjects (`?s`), cities, users, and companies from Paranet 1, and performs a sub-query within Paranet 3 to get data where the city is `Belgrade`.
- **Filter clause:** The `filter` clause is used to ensure that the city data from Paranet 3 contains the string "Belgrade".

Federated SPARQL queries provide a powerful way to aggregate and analyze data across multiple paranets, this enables more complex data retrieval and cross-paranet data integration, making it easier to gather comprehensive insights from diverse data sources.
