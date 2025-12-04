---
description: Learn how to get testnet tokens from the OriginTrail Discord faucet bot
---

# Test token faucet

The OriginTrail Decentralized Knowledge Graph (DKG) provides a testing environment on the NeuroWeb testnet, Gnosis Chiado, and Base Sepolia blockchains. To perform various blockchain operations on these testnets, users need both **test TRAC on the chosen network** and the **test utility token** of their chosen blockchain for gas.

The **OriginTrail faucet service**, which provides test tokens, is deployed on the [**OriginTrail Discord server**](https://discord.gg/D9n4TeTaKG) and located in the [**#faucet-bot**](https://discord.gg/c8NSEmND) channel.

To view the available faucet options, run the following command in the chat of the **#faucet-bot** channel:

```
!help
```

The output will look like the one shown below:

<figure><img src="../../.gitbook/assets/Screenshot 2025-01-29 at 13.34.32.png" alt=""><figcaption><p>Available Faucet commands</p></figcaption></figure>

Currently, depending on your requirements, you can request tokens for the following blockchains:

1. **NeuroWeb:** test TRAC and NEURO
2. **Gnosis Chiado:** test TRAC and xDAI
3. **Base Sepolia:** test TRAC

{% hint style="success" %}
**NeuroWeb:** Make sure to run the NEURO request command (!fundme\_neuroweb) first to initialize your wallet on the NeuroWeb blockchain. Once you receive NEURO in your wallet, you can run the TRAC request command. If your wallet isn't initialized on NeuroWeb, you will not be able to receive TRAC.\
\
**Base Sepolia:** Please refer to the official Base [documentation](https://docs.base.org/docs/tools/network-faucets/) for instructions on acquiring test ETH as gas for the Base Sepolia blockchain.
{% endhint %}

If you experience any issues with the Faucet Bot, please tag the core developers in one of the Discord channels.
