# Knowledge submission & curation

A staging paranet is the process of submitting a **Knowledge Collection (KC)** for approval before it becomes part of the paranet. **Curators review and either approve or reject the KC** to ensure data accuracy and quality before it's added to the network.

{% hint style="info" %}
**Knowledge collection (KC)** is a **collection of Knowledge Assets.** It refers to structured data that can be stored, shared, and validated within a distributed network.
{% endhint %}

To maintain data integrity and prevent malicious or irrelevant information from being added, the paranet system includes **permission controls** that regulate who can submit and approve new data entries.

{% hint style="info" %}
Here's the demo code for a [**staging paranet**](https://github.com/OriginTrail/dkg.js/blob/v8/develop/examples/paranet-permissioned-kc-submission-demo.js).
{% endhint %}

**Why is KC management important?**

In decentralized networks, anyone can technically contribute data, but not all data should be trusted. Without a system for validation, there is a risk of:

- **Spam or false data** being introduced into the network.
- **Duplicate or low-quality data** reducing the efficiency and reliability of the system.
- **Unauthorized modifications** that could disrupt the credibility of shared knowledge.

To prevent these issues, **paranet uses a curator-based system**, in which **only authorized users (curators) can decide which Knowledge Assets get added to the network**.

**How does the KC submission work?**

1. **A miner creates a collection of Knowledge Assets (KC)** — This is structured data (e.g., city information, scientific research, metadata, etc.) prepared for submission.
2. **The KC is staged to the paranet** — This means it is submitted for approval but is not yet officially part of the paranet.
3. **A curator reviews the submission** — The curator has the authority to either **accept or reject** the KC.
4. **If approved, the KC is officially submitted** and becomes part of the paranet network. If rejected, the KC is not added, and the user must make changes or submit a different KC.

This structured approach ensures that only **reliable and relevant data** is added to the network while maintaining a decentralized governance model.

\
When creating a **paranet**, we can define permissions for:

- [ ] **Nodes** – Who can join the network. (Not added yet)
- [ ] **Miners** – Who can validate data. (Not added yet)
- [x] &#x20;**KC submissions** – Who can add a new **collection of Knowledge Assets**.

### Adding a curator

A curator is a user who decides **which collection of Knowledge Assets (KC) are accepted or rejected**.\
Curators are added using their **address**, and they control the approval of new data within the Paranet.

**Add a curator:**

```js
DkgClient.paranet.addCurator(paranetUAL, PUBLIC_KEY);
```

**Remove a curator:**

```js
DkgClient.paranet.removeCurator(paranetUAL, PUBLIC_KEY);
```

**Check if a user is a curator:**

```js
isCurator = await DkgClient.paranet.isCurator(paranetUAL, PUBLIC_KEY);
console.log("Is user a curator?", isCurator);
```

### **Staging — Submitting KC to a paranet**

When a **Knowledge Collection (KC)** is staged, it must go through the **staging process** before being officially added to the paranet.

This means the KC is **submitted for review**, and the **curator decides whether to accept or reject it**.

**Create a new Knowledge Collection (KC):**

```js
jsCopyEditconst content = {
    public: {
        '@context': 'https://www.schema.org',
        '@id': 'urn:us-cities:info:dallas',
        '@type': 'City',
        name: 'Dallas',
        state: 'Texas',
        population: '1,343,573',
        area: '386.5 sq mi',
    }
};

const createKcResult = await DkgClient.asset.create(content, { epochsNum: 2 });
console.log('Knowledge Collection Created:', createKcResult);
```

**Stage KC to the paranet (submit for approval):**

```js
stageToParanetResult = await DkgClient.paranet.stageKnowledgeCollection(
  createKcResult.UAL,
  paranetUAL,
);
console.log("Knowledge Collection Staged to Paranet:", stageToParanetResult);
```

**Check if KC is staged for approval:**

```js
isStaged = await DkgClient.paranet.isKnowledgeCollectionStaged(
  createKcResult.UAL,
  paranetUAL,
);
console.log("Is KC staged to Paranet?", isStaged);
```

### Reviewing and approving KC

A curator can **accept or reject** a knowledge collection:

**Reject a KC:**

```js
DkgClient.paranet.reviewKnowledgeCollection(
  createKcResult.UAL,
  paranetUAL,
  false,
);
console.log("Knowledge Collection Rejected");
```

**Accept a KC:**

```js
DkgClient.paranet.reviewKnowledgeCollection(
  createKcResult.UAL,
  paranetUAL,
  true,
);
console.log("Knowledge Collection Approved");
```

**Check approval status:**

```js
approvalStatus = await DkgClient.paranet.getKnowledgeCollectionApprovalStatus(
  createKcResult.UAL,
  paranetUAL,
);
console.log("KC Approval Status:", approvalStatus);
```

**Check if KC is registered:**

```js
isRegistered = await DkgClient.paranet.isKnowledgeCollectionRegistered(
  createKcResult.UAL,
  paranetUAL,
);
console.log("Is KC registered to Paranet?", isRegistered);
```

### **Conclusion**

- **Curators manage which KC entries are accepted to a paranet.** Users who wish to submit data to a paranet must go through the **staging process**.

{% hint style="info" %}
**The curator** doesn't have to be human; it can also be an AI agent.
{% endhint %}

- **KC must first be submitted for approval**, and then the curator can **accept or reject it**.
- **All operations are tied to the user's public key**, enabling **secure and decentralized data management**. 🚀
