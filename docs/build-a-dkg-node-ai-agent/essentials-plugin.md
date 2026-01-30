---
description: >-
  Learn about the default plugin that powers core functions like publishing,
  querying, and verifying Knowledge Assets.
---

# Essentials Plugin

The **DKG Node Essentials Plugin** ships preinstalled with every DKG Node. It provides the **baseline tools, resources, and APIs** you’ll use to **publish** and **retrieve** verifiable knowledge on the OriginTrail DKG. It’s also the reference implementation for **including Source Knowledge Assets** in tool responses, so users can see _which verifiable knowledge_ from the DKG powered an answer.

{% hint style="info" %}
💡**Tip:** Use DKG Essentials as your **starting toolkit**. You can customize these tools or use them as blueprints for your own plugins.
{% endhint %}

### What’s included

* **DKG Knowledge Asset create tool** - basic too to publish Knowledge assets from a JSON-LD object with `public` or `private` visibility
* **DKG Knowledge Asset get** tool - retrieve a Knowledge asset by it's **UAL**.

Publishing Knowledge assets with the "public" visibility, will replicate their content to the entirety of the DKG - making it **publicly visible**. When creating private knowledge assets, their content never leaves your node - only knowledge asset registration material (such as the cryptographic hash and UALs) will be published publicly.

#### 🧱 Resources (MCP)

* **Knowledge Asset (KA) resource** — resolve a **KA UAL.**
* **Knowledge Collection (KC) resource** — resolve a **KC UAL**.

***

### Tool reference

Below is a consistent structure you can reuse for every tool: **Purpose → Inputs → Returns → Example → Notes**.

#### 1) DKG Knowledge Asset **create**

**Purpose**\
Publish a single **Knowledge Asset** **(KA)** or a single **Knowledge Collection (KC)** to the DKG.

**Inputs**

* `content` _(string, required)_ — a **JSON-LD** string (e.g., Schema.org-based) representing a KA or KC.
* `privacy` _(string, optional)_ — `"public"` or `"private"`, defaults to `"private"` if no input is provided.

**Returns**

All tools return an **MCP-formatted** payload:

* `content` _(array)_ — human-readable messages. This tool returns:
  * a success line,
  * the **UAL**, and
  * a **DKG Explorer** link derived from the UAL.

**Example input (JSON-LD)**

```json
{
  "@context": "https://schema.org/",
  "@type": "CreativeWork",
  "@id": "urn:first-dkg-ka:info:hello-dkg",
  "name": "Hello DKG",
  "description": "My first Knowledge Asset on the Decentralized Knowledge Graph!"
}
```

**Typical response**

```json
Knowledge Asset collection successfully created.

UAL: did:dkg:otp:20430/0xABCDEF0123456789/12345/67890
DKG Explorer link: https://dkg-testnet.origintrail.io/explore?ual=did:dkg:otp:20430/0xABCDEF0123456789/12345/67890
```

***

#### 2) DKG Knowledge Asset GET

**Purpose**\
Fetch a **KA or KC** by **UAL**.

**Inputs**

* `ual` _(string, required)_ — the KA or KC UAL.

**Returns**

All tools return an **MCP-formatted** payload:

* `content` _(array)_ — one item with **pretty-printed JSON** (as text) containing:
  * `assertion` — the JSON-LD content of the KA/KC
  * `operation` — retrieval info: `operationId` and `status` (e.g., `COMPLETED`)

**Example input (UAL)**

```
did:dkg:otp:20430/0xABCDEF0123456789/12345/67890
```

**Typical response**

```json
{
  "assertion": [
    {
      "@id": "urn:ka:example",
      "http://schema.org/name": [
        {
          "@value": "DKG Example KA"
        }
      ],
      "http://schema.org/description": [
        {
          "@value": "The best KA example on the DKG"
        }
      ],
      "@type": [
        "http://schema.org/CreativeWork"
      ]
    }
  ],
  "operation": {
    "get": {
      "operationId": "3951dd30-4781-4584-a3f2-4116ce26e8d2",
      "status": "COMPLETED"
    }
  }
}
```

#### 3) **DKG SPARQL query tool**

**Purpose**\
Execute SPARQL queries on the DKG to search, filter, and retrieve knowledge. Supports both SELECT queries (tabular results) and CONSTRUCT queries (graph/N-triples output).

**Inputs**

* `query` _(string, required)_ — a valid SPARQL SELECT or CONSTRUCT query.

**Returns**

All tools return an **MCP-formatted** payload:

* `content` _(array)_ — one item containing:
  * For **SELECT** queries: JSON-formatted bindings with the query results.
  * For **CONSTRUCT** queries: N-triples formatted graph data.

**Example input (SELECT query)**

```
SELECT ?name ?description
WHERE {
  ?s <http://schema.org/name> ?name .
  ?s <http://schema.org/description> ?description .
}
LIMIT 10
```

**Typical response (SELECT)**

```json
{
  "data": [
    {
      "name": "\"Hello DKG\"",
      "description": "\"My first Knowledge Asset on the Decentralized Knowledge Graph!\""
    },
    {
      "name": "\"DKG Example KA\"",
      "description": "\"The best KA example on the DKG\""
    }
  ]
}
```

**Example input (CONSTRUCT query)**

```
CONSTRUCT { ?s <http://schema.org/name> ?name }
WHERE { ?s <http://schema.org/name> ?name }
LIMIT 10
```

**Typical response (CONSTRUCT)**

```
<uuid:6271829154> <http://schema.org/name> "Jane Doe" .
<uuid:9650572417> <http://schema.org/name> "John Smith" .
<uuid:9998372617> <http://schema.org/name> "Alice Wonder" .
```

**Notes**

* Only **SELECT** and **CONSTRUCT** query types are supported. UPDATE operations (INSERT, DELETE, MODIFY) are not allowed.
* Invalid SPARQL syntax will return a validation error before execution.
* Results are automatically formatted based on query type for optimal readability.

### Coming soon (preview)

* **Document → JSON/Markdown** - convert PDFs/Word/TXT/… into JSON/Markdown for downstream processing.
* **JSON/Markdown → JSON-LD** - transform structured text into a **schema.org** knowledge graph ready for publishing.

### Source Knowledge Assets in tool responses

You can attach **source Knowledge Assets** to any MCP tool response, allowing the DKG Node Agent (and other agents you might use with your DKG Node) to display which Knowledge Assets were used to form the answer.

<figure><img src="../.gitbook/assets/image (2).png" alt=""><figcaption></figcaption></figure>

Use the helper **`withSourceKnowledgeAssets`** from the plugin’s `utils` submodule to include source Knowledge Assets along with your other tool responses:

```ts
import { withSourceKnowledgeAssets } from "@dkg/plugin-dkg-essentials/utils";

// Some code ...

mcp.registerTool(
  "tool name...",
  {
    title: "Tool name",
    description: "Tool description",
    inputSchema: { /* expected input variables and format */ },
  },
  async (params) => {
    // Your tool code here
    return {
      content: [{type: "text", text: "My tool response..."}],
    };
    
    return withSourceKnowledgeAssets({
      content: [{type: "text", text: "My tool response..."}],
    }, [
      { title: "KA 1", issuer: "OriginTrail", ual: "did:dkg..." },
      { title: "KA 2", issuer: "OriginTrail", ual: "did:dkg..." },
      { title: "KA 3", issuer: "OriginTrail", ual: "did:dkg..." },
    ]);
  }
);
```

{% hint style="info" %}
💡**Tip:** To see the source Knowledge Assets when using agents other than the DKG Node Agent (e.g., VS Code, Cursor, etc.), you will need to adjust your prompt to ask for them to be shown in the response (i.e, "Please include source Knowledge Assets in the response if there are any").
{% endhint %}

You can also check the `packages/plugin-example` to see how this works first-hand.

***

### Customize & extend

* **Tune the essentials** — adjust defaults (e.g., privacy, retry/finality settings) or validate inputs for your domain.
* **Use as a scaffold** — copy the patterns (tool registration, response helpers, resource resolvers) to **build new tools** and full plugins.
* **Compose with other plugins** — chain tools into **end-to-end agentic pipelines**.

{% hint style="success" %}
Builders are encouraged to **customize DKG Essentials** to fit their use case, and to **use these tools as the basis** for creating new, domain-specific capabilities.
{% endhint %}

***

**Next step: Creating custom plugins for your node**\
Want more than the basics? Next, we’ll show you how to **build your own plugins** — integrating APIs, adding new tools, and tailoring your node’s capabilities to your specific use case.
