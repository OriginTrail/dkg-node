# Query the DKG

If you're just getting started with querying the OriginTrail Decentralized Knowledge Graph (DKG), don't worry — you're in the right place! We use the SPARQL query language to interact with the DKG. At first, SPARQL might seem confusing (we've all been there), but once you get the hang of it, it's actually much simpler than it looks — and incredibly powerful.

## Paranets, Knowledge Collections, and Knowledge Assets

Paranets are isolated environments within the DKG where participants can publish and query data privately or publicly. Within a paranet, a Knowledge Collection (KC) groups together multiple Knowledge Assets (KAs). A KC acts as a container that maintains a set of KAs, each representing a distinct set of information, assertions, or metadata. You can read more about these concepts [here](../../dkg-knowledge-hub/learn-more/readme/dkg-key-concepts.md).

Relationships:

- A paranet contains multiple Knowledge Collections (KCs).
- Each KC contains multiple Knowledge Assets (KAs).
- Each KA is stored in its own named graph.

## Understanding DKG connections

Before diving into queries, here’s a quick overview of the most important RDF connections you'll encounter in the DKG:

- <kbd>\<current:graph> dkg:hasNamedGraph \<KaGraph></kbd> - This tells us which Knowledge Asset graphs are currently considered valid and active. You’ll use this to filter for the current version of a KA.
- <kbd>\<metadata:graph> \<KcUal> dkg:hasNamedGraph \<KaGraph></kbd> - This connection links a Knowledge Collection (KC) to one or more Knowledge Assets (KAs). It’s used when looking up KAs via their KC metadata (e.g. publisher, timestamp).
- <kbd>\<metadata:graph> \<KcUal> dkg:hasKnowledgeAsset \<KaUAL></kbd> - This links the KC to the KA’s Universal Asset Locator (UAL). While it doesn’t point to the named graph directly, it’s important for referencing and versioning KAs.
- <kbd><</kbd>[<kbd>paranetUAL</kbd>](#user-content-fn-1)[^1]<kbd>> dkg:hasNamedGraph \<KaGraph></kbd> - This is used when querying inside a paranet. The paranet graph stores references to all associated KAs within that scope. You can use it to restrict queries to a specific environment.

{% hint style="info" %}
KaGraph - did:dkg:hardhat1:31337/0xd5724171c2b7f0aa717a324626050bd05767e2c6/4/1/public

KaUal - did:dkg:hardhat1:31337/0xd5724171c2b7f0aa717a324626050bd05767e2c6/4/1
{% endhint %}

## Query examples

### Fetch all KAs by publisher on a specific day

```sparql
PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

SELECT ?kaGraph
WHERE {
    GRAPH <metadata:graph> {
        ?kc dkg:publishedBy <did:dkg:publisherKey/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266> .
        ?kc dkg:publishTime ?publishTime .
        FILTER(STRSTARTS(STR(?publishTime), "2025-04-28"))
        ?kc dkg:hasNamedGraph ?kaGraph .
    }
}

```

### Fetch all KAs by publisher key in a paranet

Paranet in which we are searching for the KAs: did:dkg:hardhat1:31337/0xd5724171c2b7f0aa717a324626050bd05767e2c6/3/1

```sparql
PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

SELECT ?kaGraph
WHERE {
    GRAPH <did:dkg:hardhat1:31337/0xd5724171c2b7f0aa717a324626050bd05767e2c6/3/1> {
        <did:dkg:hardhat1:31337/0xd5724171c2b7f0aa717a324626050bd05767e2c6/3/1> dkg:hasNamedGraph ?kaGraph .
    }
    GRAPH <metadata:graph> {
        ?kc dkg:hasNamedGraph ?kaGraph ;
            dkg1:publishedBy <did:dkg:publisherKey/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266> .
    }
}

```

### Fetch all KAs by transaction hash

```sparql
PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

SELECT ?kaGraph
WHERE {
    GRAPH <metadata:graph> {
        ?kc dkg:publishTx "0x028cefe6e1a828508c730aeef498117be8e47935619d057d061c203ae2a30b6f" .
        ?kc dkg:hasNamedGraph ?kaGraph .
    }
}

```

## Generic query template

This is the go-to pattern for querying across currently active KAs.

```sparql
PREFIX schema: <http://schema.org/>
PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

SELECT ?subject ?predicate ?object ?containedGraph
WHERE {
    GRAPH <current:graph> {
        ?g dkg:hasNamedGraph ?containedGraph .
    }
    GRAPH ?containedGraph {
        ?subject ?predicate ?object .
        # Optional: FILTER or specific patterns can go here
    }
}

```

## Learn more

Want to dive deeper into SPARQL? Check out this awesome guide:[ SPARQL 1.1 Query Language Overview](https://www.w3.org/TR/sparql11-query/).

Happy querying! You've got this. 🚀

---

**Next step: DKG SDK**\
Once you know how to query the graph, it’s time to go deeper and start **building with code**. The next section introduces the official **DKG SDKs (JavaScript and Python)**, which make it simple to publish, retrieve, and verify Knowledge Assets programmatically.

[^1]:
