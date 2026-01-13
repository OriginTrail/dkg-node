---
description: >-
  Learn how to use the DKG client (ctx.dkg) in your plugins to query, retrieve, 
  and publish Knowledge Assets on the OriginTrail Decentralized Knowledge Graph.
---

# Using the DKG Client

When building plugins for your DKG Node, you have access to `ctx.dkg` — a powerful client that lets you interact directly with the OriginTrail Decentralized Knowledge Graph. This page covers the core operations you'll use most often: **querying**, **getting**, and **publishing** Knowledge Assets.

{% hint style="info" %}
💡 **Quick Reference:** The `ctx.dkg` client is an instance of [dkg.js](advanced-features-and-toolkits/dkg-sdk/dkg-v8-js-client/README.md) that's pre-configured and injected into every plugin via the `defineDkgPlugin` function.
{% endhint %}

## Accessing the DKG Client

Inside your plugin, you receive `ctx` as the first argument to `defineDkgPlugin`. The DKG client is available at `ctx.dkg`:

```ts
import { defineDkgPlugin } from "@dkg/plugins";

export default defineDkgPlugin((ctx, mcp, api) => {
  // ctx.dkg is your DKG client instance
  // ctx.blob is the blob storage for file handling
  
  // Register tools and routes that use ctx.dkg...
});
```

***

## Querying the DKG with SPARQL

The most powerful way to explore and retrieve data from the DKG is through SPARQL queries. SPARQL is a query language for RDF data — think of it like SQL, but for graph databases.

### Basic Query Syntax

Use `ctx.dkg.graph.query()` to execute SPARQL queries:

```ts
const result = await ctx.dkg.graph.query(
  `PREFIX schema: <http://schema.org/>
   SELECT ?subject ?name
   WHERE {
     ?subject schema:name ?name .
   }`,
  "SELECT"  // Query type: SELECT, CONSTRUCT, ASK, or DESCRIBE
);
```

### Query Types

| Type | Description | Returns |
|------|-------------|---------|
| `SELECT` | Returns variable bindings (rows of data) | Array of objects with variable bindings |
| `CONSTRUCT` | Builds a new RDF graph from results | RDF triples in JSON-LD format |
| `ASK` | Boolean query — does a pattern exist? | `true` or `false` |
| `DESCRIBE` | Returns RDF data about a resource | RDF description of the resource |

### Query Response Structure

```ts
{
  "status": "COMPLETED",
  "data": [
    { "subject": "https://example.org/entity1", "name": "Example Entity" },
    { "subject": "https://example.org/entity2", "name": "Another Entity" }
  ]
}
```

### Example: Building a Query Tool

Here's a complete example of registering an MCP tool that queries the DKG:

```ts
import { defineDkgPlugin } from "@dkg/plugins";
import { z } from "@dkg/plugins/helpers";

export default defineDkgPlugin((ctx, mcp) => {
  mcp.registerTool(
    "search-entities",
    {
      title: "Search DKG Entities",
      description: "Search for entities by name in the DKG",
      inputSchema: {
        searchTerm: z.string().describe("Name or partial name to search for"),
      },
    },
    async ({ searchTerm }) => {
      const query = `
        PREFIX schema: <http://schema.org/>
        PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>
        
        SELECT ?entity ?name ?type
        WHERE {
          GRAPH <current:graph> {
            ?g dkg:hasNamedGraph ?kaGraph .
          }
          GRAPH ?kaGraph {
            ?entity schema:name ?name .
            OPTIONAL { ?entity a ?type }
            FILTER(CONTAINS(LCASE(STR(?name)), LCASE("${searchTerm}")))
          }
        }
        LIMIT 20
      `;
      
      const result = await ctx.dkg.graph.query(query, "SELECT");
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result.data, null, 2)
        }],
      };
    }
  );
});
```

### Common Query Patterns

#### Query All Current Knowledge Assets

Use `<current:graph>` to filter for currently valid KAs:

```sparql
PREFIX schema: <http://schema.org/>
PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

SELECT ?subject ?predicate ?object
WHERE {
  GRAPH <current:graph> {
    ?g dkg:hasNamedGraph ?kaGraph .
  }
  GRAPH ?kaGraph {
    ?subject ?predicate ?object .
  }
}
LIMIT 100
```

#### Query Within a Specific Paranet

Restrict queries to a paranet scope:

```sparql
PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

SELECT ?kaGraph ?subject ?predicate ?object
WHERE {
  GRAPH <did:dkg:base:84532/0xcontract/paranetId> {
    <did:dkg:base:84532/0xcontract/paranetId> dkg:hasNamedGraph ?kaGraph .
  }
  GRAPH ?kaGraph {
    ?subject ?predicate ?object .
  }
}
```

#### Query by Publisher

Find all KAs published by a specific wallet:

```sparql
PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

SELECT ?kaGraph
WHERE {
  GRAPH <metadata:graph> {
    ?kc dkg:publishedBy <did:dkg:publisherKey/0xYourWalletAddress> .
    ?kc dkg:hasNamedGraph ?kaGraph .
  }
}
```

#### Query by Date Range

Filter KAs by publish time:

```sparql
PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

SELECT ?kaGraph ?publishTime
WHERE {
  GRAPH <metadata:graph> {
    ?kc dkg:publishTime ?publishTime .
    FILTER(?publishTime >= "2025-01-01T00:00:00Z"^^xsd:dateTime)
    FILTER(?publishTime < "2025-02-01T00:00:00Z"^^xsd:dateTime)
    ?kc dkg:hasNamedGraph ?kaGraph .
  }
}
```

{% hint style="success" %}
**Pro Tip:** For more complex queries and advanced SPARQL patterns, see the [Query the DKG](advanced-features-and-toolkits/querying-the-dkg.md) documentation.
{% endhint %}

***

## Getting Knowledge Assets

To retrieve a specific Knowledge Asset by its UAL (Uniform Asset Locator), use `ctx.dkg.asset.get()`.

### Basic Get Operation

```ts
const result = await ctx.dkg.asset.get(ual);
```

### Get with Options

```ts
const result = await ctx.dkg.asset.get(ual, {
  includeMetadata: true,  // Include metadata about the KA
});
```

### Response Structure

```ts
{
  "assertion": [
    {
      "@id": "https://example.org/entity",
      "http://schema.org/name": [{ "@value": "Example Entity" }],
      "@type": ["http://schema.org/Thing"]
    }
  ],
  "operation": {
    "get": {
      "operationId": "uuid-here",
      "status": "COMPLETED"
    }
  }
}
```

### Example: Get Tool Implementation

```ts
import { defineDkgPlugin } from "@dkg/plugins";
import { z } from "@dkg/plugins/helpers";

export default defineDkgPlugin((ctx, mcp) => {
  mcp.registerTool(
    "get-knowledge-asset",
    {
      title: "Get Knowledge Asset",
      description: "Retrieve a Knowledge Asset by its UAL",
      inputSchema: {
        ual: z.string().describe("The UAL of the Knowledge Asset"),
      },
    },
    async ({ ual }) => {
      try {
        const result = await ctx.dkg.asset.get(ual, {
          includeMetadata: true,
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }],
        };
      } catch (error) {
        throw new Error(`Failed to get asset: ${error.message}`);
      }
    }
  );
});
```

### Understanding UALs

A UAL (Uniform Asset Locator) uniquely identifies a Knowledge Asset:

```
did:dkg:base:84532/0xd5550173b0f7b8766ab2770e4ba86caf714a5af5/10310
```

Components:
- `did:dkg` — DID method prefix
- `base:84532` — Blockchain name and chain ID
- `0xd555...` — Contract address
- `10310` — Asset ID (Knowledge Collection ID + optional Asset ID)

***

## Publishing Knowledge Assets

Use `ctx.dkg.asset.create()` to publish new Knowledge Assets to the DKG.

### Basic Create Operation

```ts
const content = {
  public: {
    "@context": "http://schema.org",
    "@id": "https://example.org/my-entity",
    "@type": "Thing",
    "name": "My First Knowledge Asset",
    "description": "An example entity on the DKG"
  }
};

const result = await ctx.dkg.asset.create(content, {
  epochsNum: 2,  // How many epochs (months) to keep the asset
});
```

### Public vs Private Content

You can publish content as **public** (replicated across the network) or **private** (stays on your node only):

```ts
const content = {
  public: {
    "@context": "http://schema.org",
    "@id": "https://example.org/entity",
    "@type": "Organization",
    "name": "Public Company Name"
  },
  private: {
    "@context": "http://schema.org",
    "@id": "https://example.org/entity",
    "@type": "OrganizationPrivateData",
    "revenue": "$10M",
    "employeeCount": 150
  }
};

const result = await ctx.dkg.asset.create(content, {
  epochsNum: 6,
});
```

### Create Options

| Option | Description | Default |
|--------|-------------|---------|
| `epochsNum` | Number of epochs (months) to store the asset | Required |
| `minimumNumberOfFinalizationConfirmations` | Confirmations needed before finalized | 3 |
| `minimumNumberOfNodeReplications` | Minimum nodes to replicate to | 1 |

### Response Structure

```ts
{
  "UAL": "did:dkg:base:84532/0xd555.../10310",
  "datasetRoot": "0x09d73283...",
  "operation": {
    "mintKnowledgeAsset": {
      "transactionHash": "0x1a9f6b95...",
      "blockNumber": 20541620,
      "status": true
    },
    "publish": {
      "operationId": "uuid-here",
      "status": "PUBLISH_REPLICATE_END"
    },
    "finality": { "status": "FINALIZED" }
  }
}
```

### Example: Create Tool Implementation

```ts
import { defineDkgPlugin } from "@dkg/plugins";
import { z } from "@dkg/plugins/helpers";

export default defineDkgPlugin((ctx, mcp) => {
  mcp.registerTool(
    "publish-knowledge-asset",
    {
      title: "Publish Knowledge Asset",
      description: "Create and publish a new Knowledge Asset to the DKG",
      inputSchema: {
        jsonld: z.string().describe("JSON-LD content to publish"),
        privacy: z.enum(["public", "private"]).default("private"),
        epochs: z.number().min(1).max(24).default(2),
      },
    },
    async ({ jsonld, privacy, epochs }) => {
      try {
        const content = JSON.parse(jsonld);
        const wrapped = { [privacy]: content };
        
        const result = await ctx.dkg.asset.create(wrapped, {
          epochsNum: epochs,
          minimumNumberOfFinalizationConfirmations: 3,
          minimumNumberOfNodeReplications: 1,
        });
        
        const ual = result?.UAL;
        
        return {
          content: [{
            type: "text",
            text: `✅ Knowledge Asset published!\n\nUAL: ${ual}\nPrivacy: ${privacy}\nEpochs: ${epochs}`
          }],
        };
      } catch (error) {
        throw new Error(`Failed to publish: ${error.message}`);
      }
    }
  );
});
```

### JSON-LD Best Practices

When creating Knowledge Assets, follow these JSON-LD conventions:

1. **Always include `@context`** — Use `http://schema.org` or a custom ontology
2. **Use `@id` for unique identification** — URIs that uniquely identify your entity
3. **Specify `@type`** — The type of entity (e.g., `Person`, `Organization`, `Product`)
4. **Use schema.org vocabulary** — Prefer standard properties for interoperability

```ts
{
  "@context": "http://schema.org",
  "@id": "urn:myapp:products:12345",
  "@type": "Product",
  "name": "Wireless Headphones",
  "brand": {
    "@type": "Brand",
    "name": "AudioTech"
  },
  "offers": {
    "@type": "Offer",
    "price": "99.99",
    "priceCurrency": "USD"
  }
}
```

***

## Complete Plugin Example

Here's a full plugin that demonstrates all three operations:

```ts
import { defineDkgPlugin } from "@dkg/plugins";
import { z } from "@dkg/plugins/helpers";

export default defineDkgPlugin((ctx, mcp, api) => {
  // 1. Query Tool
  mcp.registerTool(
    "dkg-search",
    {
      title: "Search DKG",
      description: "Search the DKG using a SPARQL query",
      inputSchema: {
        query: z.string().describe("SPARQL query to execute"),
        queryType: z.enum(["SELECT", "CONSTRUCT", "ASK", "DESCRIBE"]).default("SELECT"),
      },
    },
    async ({ query, queryType }) => {
      const result = await ctx.dkg.graph.query(query, queryType);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // 2. Get Tool
  mcp.registerTool(
    "dkg-get",
    {
      title: "Get Knowledge Asset",
      description: "Retrieve a Knowledge Asset by UAL",
      inputSchema: {
        ual: z.string().describe("UAL of the Knowledge Asset"),
      },
    },
    async ({ ual }) => {
      const result = await ctx.dkg.asset.get(ual);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // 3. Create Tool
  mcp.registerTool(
    "dkg-publish",
    {
      title: "Publish Knowledge Asset",
      description: "Publish a new Knowledge Asset",
      inputSchema: {
        content: z.string().describe("JSON-LD content"),
        privacy: z.enum(["public", "private"]).default("private"),
      },
    },
    async ({ content, privacy }) => {
      const parsed = JSON.parse(content);
      const result = await ctx.dkg.asset.create({ [privacy]: parsed }, {
        epochsNum: 2,
      });
      return {
        content: [{ type: "text", text: `Published! UAL: ${result.UAL}` }],
      };
    }
  );

  // 4. REST API endpoint for querying
  api.post("/query", async (req, res) => {
    try {
      const { query, queryType = "SELECT" } = req.body;
      const result = await ctx.dkg.graph.query(query, queryType);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
});
```

***

## Additional DKG Client Methods

Beyond the core operations, `ctx.dkg` provides additional functionality:

| Method | Description |
|--------|-------------|
| `ctx.dkg.node.info()` | Get information about the connected DKG node |
| `ctx.dkg.asset.update()` | Update an existing Knowledge Asset |
| `ctx.dkg.asset.increaseAllowance()` | Pre-approve token spending for faster publishing |
| `ctx.dkg.asset.decreaseAllowance()` | Revoke token spending authorization |

***

## Error Handling

Always wrap DKG operations in try-catch blocks:

```ts
try {
  const result = await ctx.dkg.asset.get(ual);
  // Handle success
} catch (error) {
  ctx.logger?.error("DKG operation failed:", error);
  throw new Error(`Operation failed: ${error.message}`);
}
```

Common error scenarios:
- **Network errors** — Node unreachable or timeout
- **Invalid UAL** — Malformed or non-existent asset
- **Insufficient funds** — Not enough tokens for publishing
- **Invalid JSON-LD** — Malformed content structure

***

## Next Steps

- **[Query the DKG](advanced-features-and-toolkits/querying-the-dkg.md)** — Deep dive into SPARQL query patterns
- **[DKG JavaScript SDK](advanced-features-and-toolkits/dkg-sdk/dkg-v8-js-client/README.md)** — Full SDK documentation
- **[Customizing your DKG Agent](customizing-your-dkg-agent.md)** — Build custom plugins
- **[Essentials Plugin](essentials-plugin.md)** — Reference implementation for DKG tools
