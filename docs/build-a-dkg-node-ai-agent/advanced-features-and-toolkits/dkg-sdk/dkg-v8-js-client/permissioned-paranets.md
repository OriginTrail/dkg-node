# Permissioned paranets

**Paranet permission policies** define which nodes and knowledge miners can participate in a paranet. These policies are set by the **paranet operator** at the time of creation.

{% hint style="info" %}
**A paranet operator** is the account that owns the Knowledge Asset from which the paranet was created.
{% endhint %}

There are two permission policies:

• PARANET_NODES_ACCESS_POLICY – governs which nodes can sync Knowledge Collections.

• PARANET_MINERS_ACCESS_POLICY – governs which knowledge miners (wallet addresses) can submit Knowledge Collection

{% hint style="info" %}
Here is demo code for a [permissioned paranet](https://github.com/OriginTrail/dkg.js/blob/v8/develop/examples/curated-paranet-demo.js).&#x20;
{% endhint %}

### Paranet node-access permission policy

This policy controls which nodes are allowed to sync the paranet’s Knowledge Collections and whether they can sync the private part of the collection.

- OPEN — Any node can sync the Paranet, and only the public part of Knowledge Collections is included
- PERMISSIONED — Only approved nodes sync the paranet, and both the public and private parts of Knowledge Collection are included. Private knowledge sharing is enable!

#### Interacting with a node-access permissioned paranet

The paranet operator can **add nodes** to a permissioned paranet

```javascript
await DkgClient.paranet.addPermissionedNodes(paranetUAL, identityIds);
```

The paranet operator can **remove nodes** from a permissioned paranet

```javascript
await DkgClient.paranet.removePermissionedNodes(paranetUAL, identityIds);
```

**Anybody can check which nodes** are part of a paranet:

```javascript
await DkgClient.paranet.getPermissionedNodes(paranetUAL);
```

### Paranet-miner-access permission policy

This policy defines who can submit Knowledge Collections to a paranet.

- OPEN — Any knowledge miner (address) can submit a Knowledge Collection&#x20;
- PERMISSIONED — Only approved knowledge miners (addresses) can submit a Knowledge Collection. Allows fine-grained control over who contributes data.

{% hint style="info" %}
**Knowledge collection (KC)** is a **collection of Knowledge Assets.** It refers to structured data that can be stored, shared, and validated within a distributed network.
{% endhint %}

#### Interacting with a miner-access permissioned paranet

The paranet operator can **add miners** to a permissioned paranet

```javascript
await DkgClient.paranet.addParanetPermissionedMiners(
  paranetUAL,
  minerAddresses,
);
```

The paranet operator can **remove miners** from a permissioned paranet

```javascript
await DkgClient.paranet.removeParanetPermissionedMiners(
  paranetUAL,
  minerAddresses,
);
```

### Combining policies

These two policies can be combined in any way:

| Node Access Policy | Miner Acces Policy | Result                                                                                                                                          |
| ------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| OPEN               | OPEN               | Any node can sync the public part of the KC from the paranet and any miner can add knowledge to the paranet.                                    |
| OPEN               | PERMISSIONED       | Any node can sync the public part of the KC from the paranet and only selected miners can add knowledge to the paranet                          |
| PERMISSIONED       | OPEN               | Only selected nodes can sync both private and public parts of the KC from the paranet and any miner can add knowledge to the pParanet           |
| PERMISSIONED       | PERMISSIONED       | Only selected nodes can sync both private and public parts of the KC from the paranet and only selected miners can add knowledge to the paranet |

### Access policies and knowledge curations

These permissions will also interact with staging paranets. If a paranet has PARANET_KC_SUBMISSION_POLICY STAGING and PERMISSIONED PARANET_MINERS_ACCESS_POLICY, only approved knowledge miners can stage Knowledge Collections.
