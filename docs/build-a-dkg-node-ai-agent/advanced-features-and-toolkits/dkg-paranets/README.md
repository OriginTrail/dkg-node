# Paranets

<figure><img src="../../../.gitbook/assets/DKG Paranets.png" alt=""><figcaption></figcaption></figure>

**DKG para-networks**, or "**paranets",** are a feature of the OriginTrail Decentralized Knowledge Graph (DKG) designed to enable decentralized, co-owned, and incentivized knowledge graphs.&#x20;

With DKG paranets, both humans and AI agents can **collaboratively create, curate, and maintain knowledge graphs** while ensuring transparency, and provenance, and providing incentives for knowledge contributions.&#x20;

### Why paranets?

Traditional knowledge-sharing mechanisms have limitations:

- Knowledge bases like Wikipedia rely on centralized moderation, which can introduce bias and restrict contributions.
- AI models depend on private datasets, which often lack transparency and introduce biases.
- Scientific discoveries often remain behind paywalls, limiting access and slowing progress.

DKG paranets provide a decentralized framework for knowledge governance and sharing, addressing these challenges, while maintaining a scalable and flexible semantic data structure perfectly suitable for AI applications.

### Who's who in a paranet?

We distinguish several key roles in a DKG paranet.

- **Knowledge miners** produce new, useful Knowledge Assets and publish them to the paranet **knowledge graph.** If a miner's Knowledge Asset is included in an incentivized paranet, they might be eligible for token rewards for their contribution
- **Knowledge curators** "curate" the submitted Knowledge Assets and decide if they are to be included in the paranet knowledge graph.
- **Paranet operators** create and manage their paranets
- **Knowledge consumers** query the paranet knowledge and use it for their benefit
- [**IPO**](initial-paranet-offerings-ipos/) **voters** can support paranet growth through voting in Initial Paranet Offerings
- An associated **knowledge value** that represents the total amount of tokenized knowledge accumulated in the paranet (measured in TRAC). This value is used as a key multiplier for IPO incentives, which are implemented as a ratio. For example, a paranet operator may offer 20 NEURO tokens for each TRAC spent to knowledge miners as a reward for successfully mined Knowledge Assets.&#x20;

### Paranet structure

Each DKG paranet has a:

- **Shared knowledge graph, assembled from paranet Knowledge Assets**, published by knowledge miners and stored on the OriginTrail DKG. Depending on the paranet specifics, these Knowledge Assets conform to a set of paranet rules, such as containing knowledge about a particular topic, data structured according to a defined ontology, etc.
- **Staging environment,** where knowledge assets are registered prior to inclusion in a paranet by knowledge curators.
- **Paranet services** registered to the paranet, such as dRAG interfaces, AI agents, smart contracts, data oracles, etc.
- **Incentivization model** that specifies the rules under which growth activities in the paranet are rewarded, such as knowledge mining and paranet-specific AI services. The incentivization system may be kick-started through an Initial Paranet Offering (IPO)
- **A "home" blockchain** on which the paranet is hosting the Knowledge Assets.

### Some paranet use cases

DKG paranets provide a structured, transparent knowledge-sharing system where value follows knowledge:

- **High-performant AI agent memory**—AI agents can autonomously govern and curate their own knowledge-graph-based memory using paranets, either individually or as part of agentic swarms. (See more under the [ElizaOS agent](../../../to-be-repositioned/ai-agents/elizaos-dkg-agent.md))
- **Open scientific research**—Researchers can publish findings openly while being directly rewarded without paywalls (learn more about such a paranet [here](https://www.youtube.com/watch?v=9O-DB4EftOk)).
- **Social intelligence**—Paranet knowledge graph driven by social media insights and collaborative inputs ([learn more](https://origintrail.io/blog/growing-the-buz-economy-announcing-the-social-intelligence-paranet-launch))
- **AI training on open data**—AI models can train on decentralized, tokenized knowledge instead of closed, biased datasets.
- **Decentralized supply chain data**—Supply chain participants can contribute, verify, and access immutable records of product origins and movements, enhancing trust and reducing fraud.
- **Collaborative educational resources**—Educators and students can co-create knowledge repositories, ensuring open access to high-quality learning materials with verified provenance.
- **Decentralized journalism**—Independent journalists can publish reports that are verified and co-owned by a decentralized network, reducing misinformation and ensuring accountability.
- **Crowdsourced innovation**—Communities and organizations can jointly develop and maintain R\&D knowledge bases, allowing open collaboration while ensuring contributions are fairly recognized and rewarded.

<figure><img src="../../../.gitbook/assets/Screenshot 2025-02-26 at 17.22.36.png" alt=""><figcaption><p>A paranet knowledge graph example</p></figcaption></figure>

### Decentralized knowledge sharing for AI

The characteristics of a paranet, including its Knowledge Asset parameters and the way services are provisioned, are defined by the **paranet operator.** A paranet operator can be an individual, an organization, a Decentralized Autonomous Organization (DAO), an AI agent, etc. Paranets together form the DKG, leveraging the common underlying network infrastructure. Given that the DKG is a permissionless system, anyone can initiate a paranet.

Paranets provide a powerful substrate for AI systems. They leverage network effects of verifiable inputs from multiple sources to obtain accurate answers through Decentralized Retrieval-Augmented Generation (dRAG), allowing it to gather information from the graph of public and privately held knowledge in relevant knowledge collections to which it has access.

{% hint style="info" %}
**TL;DR**&#x20;

**Paranets are the first-ever neutral, transparent knowledge-sharing layer where value follows knowledge:**

- AI models can train on open, tokenized knowledge rather than on closed, biased datasets.
- Scientific research can be published and rewarded directly, bypassing paywalls.
- AI agents can govern their own information ecosystems individually or in swarms.
  {% endhint %}
