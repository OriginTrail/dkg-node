---
description: >-
  A guide for developers and paranet operators on launching their paranet on the
  DKG
---

# Deploy a paranet

### 1. Prepare for paranet deployment

To successfully deploy a paranet, you will have to create a knowledge collection on the DKG and execute paranet registration transactions on the blockchain. This guide assumes you already have a good idea of what purpose you are deploying your DKG paranet for and will focus only on the technical steps.&#x20;

{% hint style="info" %}
A _**Knowledge Asset**_ is an individual knowledge graph entity or a piece of data, while a _**knowledge collection**_ is a group of interconnected _Knowledge Assets_ that form a broader set of information. **Knowledge collections** enable the creation of multiple Knowledge Assets through one atomic operation.
{% endhint %}

Below is the input you will need:

- **Decide which blockchain to deploy your paranet on.** This is the blockchain on which knowledge mining will take place. All DKG-integrated blockchains can be used. However, initially, only the NeuroWeb and Base blockchains support [Initial Paranet Offerings (IPOs)](initial-paranet-offerings-ipos/).
- Pick a _paranet name_ and create a short _description_ (which will be stored on-chain).
- Decide what kind of permissions the _paranet_ will have.&#x20;
- Prepare a _**paranet profile Knowledge Asset**_ to represent your paranet as its profile on the DKG. It can be as minimal or as rich in content as you'd like.

### 2. Create your paranet profile on the DKG&#x20;

A _paranet profile_ is a Knowledge Asset that will uniquely identify your paranet and you as the paranet operator. As long as you own this Knowledge Asset, you will be able to manage paranet operator functions in the DKG paranet smart contracts.

An example paranet profile Knowledge Asset could look like this:

```json
{
  "@context": "http://schema.org/",
  "@id": "urn:some-data:info:catalog",
  "@type": "DataCatalog",
  "name": "Super Paranet",
  "description": "This is the description of the super paranet!",
  "keywords": "keyword1, keyword2, keyword3 ..."
}
```

Paranet Knowledge Assets UAL looks like this:

```
did:dkg:otp:2043/0x8f678eB0E57ee8A109B295710E23076fA3a443fe/1497611/125
```

Once you create your paranet profile Knowledge Asset, save the **Knowledge Asset UALs** that are contained within the **knowledge collection UAL**, as you will need them for the next step.

{% hint style="info" %}
As the **paranet profile** **Knowledge Asset** is an **NFT on-chain**, if you would like to change your operator key (wallet), all you need to do is transfer this NFT to your new address.
{% endhint %}

### 3. Execute _registerParanet_ transaction on the blockchain

You can use DKG.js or execute the paranet transaction directly on the smart contracts.&#x20;

{% hint style="info" %}
Here's a demo of paranets in action: [Paranet Demo](https://github.com/OriginTrail/dkg.js/blob/v8/develop/examples/paranet-demo.js).

Check the usage of the command **DkgClient.paranet.create**.
{% endhint %}

Here's a code snippet using dkg.js (from the above example)

```javascript
// first we create a paranet Knowledge Collection

let content = {
  public: {
    "@context": "http://schema.org/",
    "@id": "urn:some-data:info:catalog",
    "@type": "DataCatalog",
    name: "Super Paranet",
    description: "This is the description of the super paranet!",
    keywords: "keyword1, keyword2, keyword3 ...",
  },
};

const paranetCollectionResult = await DkgClient.asset.create(content, {
  epochsNum: 2,
});
// Paranet UAL is a Knowledge Asset UAL (combination of Knowledge Collection UAL and Knowledge Asset token id)
const paranetUAL = `${paranetCollectionResult.UAL}/1`;
const paranetOptions = {
  paranetName: "MyParanet",
  paranetDescription: "This is my paranet on the DKG!",
  paranetNodesAccessPolicy: PARANET_NODES_ACCESS_POLICY.OPEN,
  paranetMinersAccessPolicy: PARANET_MINERS_ACCESS_POLICY.OPEN,
  paranetKcSubmissionPolicy: PARANET_KC_SUBMISSION_POLICY.OPEN,
};
// using the paranet knowledge asset, create your paranet
const paranetRegistered = await DkgClient.paranet.create(
  paranetUAL,
  paranetOptions,
);
```

**That's it, you have successfully performed a minimal paranet deployment,** and knowledge miners can now start mining knowledge via your paranet.&#x20;

To proceed, we recommend setting up a **DKG node** that will continuously sync your paranet knowledge graph.

Additionally, you might want to consider [running an IPO](initial-paranet-offerings-ipos/) to incentivize knowledge miners.

{% hint style="info" %}
If you have been running a paranet on the previous V6 version of the DKG, your paranet will not automatically update to the new system. If you need help updating, please contact the core developers in [Discord](https://discord.gg/aNpBjf97) for assistance.
{% endhint %}
