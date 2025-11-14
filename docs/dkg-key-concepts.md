---
description: >-
  The OriginTrail Decentralized Knowledge Graph (DKG) introduces novel concepts,
  such as Knowledge Assets, autonomous paranets, and others. Find an overview of
  key concepts below
---

# DKG — Key concepts

## DKG Network & Nodes

OriginTrail Decentralized Knowledge Graph (DKG) is a permissionless, multi-chain infrastructure designed to host and interlink semantically-rich “[Knowledge Assets](dkg-key-concepts.md#knowledge-assets)” - structured containers of machine-readable data (e.g., RDF-based graphs) that are discoverable, verifiable, and owned by their creators.\
\
The DKG enables AI-agents and applications to query, connect, and build upon distributed knowledge while preserving provenance and trust through blockchain-anchored proof systems.

The DKG Network is comprised of network nodes, running on different servers and devices. **There are two primary node types that enable the network’s operation**. The first is **the DKG Core Node**, which hosts the public DKG, persistently stores and serves knowledge assets, participates in random-sampling proofs and token incentives, and requires a minimum stake (e.g., 50,000 TRAC) to participate.\
\
The second is the **DKG Edge Node**, which runs on devices at the “edge” (e.g., laptops, phones, IoT, and even servers, if deployed that way) and enables local knowledge processing, private-graph handling, and integration with AI-pipelines (via APIs like dRAG), allowing owners to retain control of their data while still contributing to the global DKG.&#x20;

Together, Core and Edge Nodes form the network and exchange knowledge, facilitated by the blockchain. They share the same codebas,e however, so **it is possible to turn a DKG Edge Node into a DKG Core Node (more on that later in the docs)**.

## Knowledge Assets

A Knowledge Asset is **an ownable container of knowledge in the DKG** with verifiable provenance and source. It can describe any digital or physical object, abstract concept, or really any "thing." It can easily connect to other Knowledge Assets in the OriginTrail DKG, enabling the building of sophisticated graph representations of the world (a.k.a. the World model).

More precisely, a Knowledge Asset is a web resource identified by a unique Uniform Asset Locator (or UAL, which is an extension of the traditional URL), consisting of:

* **Knowledge:** In the form of graph data (RDF) and vector embeddings, stored on the DKG (not on the blockchain).
* **Cryptographic proofs:** Representing cryptographic digests of the knowledge stored on the blockchain.
* **Uniform Asset Locator**: Globally unique URI with assigned ownership using blockchain accounts, implemented as a non-fungible token (NFT) on the blockchain.
* **Derivable vector embeddings**: These facilitate the neuro-symbolic features - such as link prediction, entity prediction, similarity search, and others.



<figure><img src=".gitbook/assets/Screenshot 2024-06-13 at 22.59.48.png" alt=""><figcaption></figcaption></figure>

Knowledge content can be observed as a time series of knowledge content states or **assertions**. Each assertion can be independently verified for integrity by the verifier recomputing the cryptographic fingerprint and comparing if the computed result matches the corresponding blockchain fingerprint record.

Technically, an assertion is represented using the n-quads serialization and a cryptographic fingerprint (the n-quads graph Merkle root, stored immutably on the blockchain) for assertion verification.

**Knowledge Assets** can be both **public and private.** Public assertion data is replicated on the OriginTrail Decentralized Network and publicly available, while private assertion data is contained within the asset owner's private domain (e.g., an OriginTrail node hosted by the asset owner, such as a person or company).

In summary, a Knowledge Asset is a combination of an NFT record and a semantic record. Using the dkg.js SDK, you can perform CRUT (create, read, update, transfer) operations on Knowledge Assets, which are explained below in further detail.

### Knowledge Asset state finality

Similar to distributed databases, the OriginTrail DKG applies replication mechanisms and needs mechanisms to reach a consistent state on the network for Knowledge Assets. In OriginTrail DKG, state consistency is reconciled using the blockchain, which hosts state proofs for Knowledge Assets, and replication commit information from DKG nodes. This means that updates for an existing Knowledge Asset are accepted by the network nodes (similar to the way nodes accept Knowledge Assets on creation) and can operate with all accepted states.

## What is a UAL?

Uniform Asset Locators (UALs) are ownable identifiers on the DKG, similar to URLs in the traditional web. The UALs follow the DID URL specification and are used to identify and locate a specific Knowledge Asset within the OriginTrail DKG.&#x20;

UAL consists of 5 parts:

* did (decentralized identifier) predicate
* dkg (decentralized knowledge graph) predicate
* blockchain identifier (otp:2043 = OriginTrail NeuroWeb Mainnet)
* blockchain address (such as the address of the relevant asset NFT smart contract)
* identifier specific to the contract, such as the ID of the NFT token
* query and fragment components

An example UAL may look like this:

```
did:dkg:otp:2043/0x5cac41237127f94c2d21dae0b14bfefa99880630/318322#color
```

This UAL refers to the DKG on the mainnet, its blockchain address is `0x5cac41237127f94c2d21dae0b14bfefa99880630` , the ID of the token is `318322`and to a property "color" inside its knowledge graph.

More information on DID URLs can be found [here](https://www.w3.org/TR/did-core/#did-url-syntax).

## TRAC token

The Trace token (TRAC) is the utility token that powers the OriginTrail Decentralized Knowledge Graph (DKG). Introduced in 2018 as an ERC-20 token on Ethereum with a fixed supply of 500 million, TRAC is essential for various network operations.

**How TRAC is used**

* **Publishing & updating Knowledge Assets** – TRAC is required to create, update, and manage Knowledge Assets in the DKG.
* **Node incentives** – Network nodes earn TRAC by hosting data, securing the network, and ensuring knowledge integrity.
* **Staking** – Nodes stake TRAC to increase their reputation and improve their ability to participate in the network.
* **Multi-chain compatibility** – TRAC operates across multiple blockchains, including Ethereum, NeuroWeb, Base, Gnosis, and Polygon.

## Decentralized Retrieval Augmented Generation

Patrick Lewis coined the term Retrieval-Augmented Generation (RAG) in a [2020 paper](https://arxiv.org/pdf/2005.11401.pdf). It is a technique for enhancing the accuracy and reliability of GenAI models with facts fetched from external sources. This allows artificial intelligence (AI) solutions to dynamically fetch relevant information before the generation process, enhancing the accuracy of responses by limiting the generation to re-working the retrieved inputs. \
\
**Decentralized Retrieval Augmented Generation (dRAG) advances the model by organizing external sources in a DKG with verifiable sources made available for AI models to use.** The framework enables a hybrid AI system that brings together neural (e.g., LLMs) and symbolic (e.g., Knowledge Graph) methodologies. Contrary to using a solely neural AI approach based on vector embedding representations, a symbolic AI approach enhances it with the strength of Knowledge Graphs by introducing a basis in symbolic representations.

dRAG is, therefore, a framework that allows AI solutions to tap into the strengths of both paradigms:&#x20;

* The powerful learning and generalization capabilities of neural networks, and&#x20;
* The precise, rule-based processing of symbolic AI.&#x20;

It operates on two core components:

(1) the DKG paranets and&#x20;

(2) AI models.&#x20;

The dRAG applications framework is entirely compatible with the existing techniques, tools, and RAG frameworks and supports all major data formats.&#x20;

## Knowledge mining

**Knowledge mining** is the process of producing high-quality, blockchain-tracked knowledge for AI pioneered by the OriginTrail ecosystem. This cyclical process leverages the key component of the OriginTrail technology - Knowledge Assets - which are ownable containers for knowledge with inherent discoverability, connectivity, and data provenance.

Similarly to Bitcoin mining, where miners collectively provide computing resources to the network and receive incentives in coins, knowledge miners contributing useful knowledge to the OriginTrail DKG receive NEURO tokens. With knowledge mining incentives enabled across multiple blockchains, the ambition is to drive exponential growth of trusted knowledge in the OriginTrail DKG.

Read more about knowledge mining in the [NeuroWeb docs](https://docs.neuroweb.ai/knowledge-mining).

## RDF & SPARQL

The Resource Description Framework (RDF) is a W3C standardized model designed to represent data about physical objects and abstract concepts (resources). It’s a model to express relations between entities using a graph format.

RDF schemas provide mechanisms for describing related resources and their relationships. It is similar to object-oriented programming languages and differs in that it describes properties in terms of resource classes. RDF enables querying via the SPARQL query language.

[Examples of schema definitions by schema.org](https://schema.org/docs/schemas.html)

## What is an NFT?

NFT—short for the non-fungible token—is a type of blockchain token used as an implementation component of Knowledge Assets in the OriginTrail DKG. The token represents ownership of the Knowledge Asset and enables its owner to perform all standardized NFT functionality, such as transferring ownership, listing it on NFT marketplaces, and using it as a rich NFT in Web3 applications.

If you are interested in learning more about NFTs, you can find out more [here](https://en.wikipedia.org/wiki/Non-fungible_token).

## Autonomus AI paranets

The next building block of the DKG is **AI para-networks** or **paranets**.

**AI para-networks** or **paranets** are autonomously operated structures in the DKG, owned by their community as a paranet operator. In paranets, we find **assemblies of Knowledge Assets** driving use cases with associated **paranet-specific AI services** and an **incentivization model** to reward knowledge miners fueling its growth.&#x20;

**To see the DKG in action, continue to the** [**Installation section**](getting-started/decentralized-knowle-dge-graph-dkg.md)**.**
