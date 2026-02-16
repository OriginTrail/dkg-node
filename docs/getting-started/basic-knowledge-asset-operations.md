---
description: >-
  A step-by-step guide to publishing new Knowledge Assets into the DKG and
  retrieving existing ones. Understand how to structure, verify, and query
  verifiable data for use in AI, apps, or research.
---

# Basic Knowledge Asset operations

## **Creating and retrieving your first Knowledge Asset**

This simple exercise demonstrates the basic end-to-end flow of the DKG — from AI-assisted publishing via the [Edge Node](decentralized-knowledge-graph-dkg.md) to knowledge retrieval (something like "Hello world").

### Create your first Knowledge Assets

In the **DKG Node UI**, send the agent this prompt with JSON-LD you want to publish:

```
Create this Knowledge Asset on the DKG for me:

{
  "@context": "https://schema.org/",
  "@type": "CreativeWork",
  "@id": "urn:first-dkg-ka:info:hello-dkg",
  "name": "Hello DKG",
  "description": "My first Knowledge Asset on the Decentralized Knowledge Graph!"
}
```

<figure><img src="../.gitbook/assets/image (1).png" alt=""><figcaption></figcaption></figure>

When asked, **allow** the agent to use the **“DKG Knowledge Asset create”** tool.

* The agent will publish your KA and return its **UAL**.
* Depending on the blockchain used and network load, publishing may take **\~10-30s**.

_(Insert screenshot of successful KA publish here)_

### Retrieve your Knowledge Asset data

Use the basic retrieval tool by asking the agent to retrieve the knowledge asset you just published by its UAL:

```
Get this Knowledge Asset from the DKG and summarize it for me:
<PASTE-YOUR-KA-UAL-HERE>
```

You should see the retrieved JSON-LD and a friendly summary.

_(Insert screenshot of successful retrieval/summary here)_
