---
description: Moving your TRAC stake from one node to another
---

# Redelegating stake

If you want **move your delegated TRAC stake from one DKG node to another**, you can use the **redelegate** feature instead of withdrawing and then delegating again. With redelegation, the amount of TRAC stake you are "redelegating" will be transferred from the original DKG node to the new DKG node of your choice, avoiding the 28-day delay that would otherwise take place if you were to withdraw tokens first.

***

## Keep in mind

* The DKG is multichain. However, **TRAC tokens can only be redelegated within nodes on the same blockchain**
* The amount of stake (TRAC) that you want to redelegate **should not exceed the second node's remaining capacity** (a node can have a maximum of 5,000,000 TRAC stake delegated to it).

***

## How can you redelegate TRAC?

1. Click on the '**Connect Wallet**' button in the top right corner of the navigation bar and follow the prompts to connect your wallet to the interface.
2. Go to the **'My delegation**' tab to see available nodes that you can redelegate from.
3. Optionally, use the **'Filter by blockchain'** dropdown to select the desired blockchain, which will filter and display nodes on this network along with their staking information.
4. Once you've decided which node you want to redelegate your TRAC from, click on the **'Manage stake'** button next to the desired node on the right side of the table. Make sure you read the disclaimer.
5. When the staking pop-up opens, you'll have the option to **Delegate, Redelegate,** or **Withdraw** TRAC tokens from the node. Proceed by selecting '**Redelegate**'.

<figure><img src="../../.gitbook/assets/Screenshot 2024-12-27 at 15.32.19.png" alt=""><figcaption><p>Use the redelegate button in the popup to redelegate your stake</p></figcaption></figure>

6. After clicking on 'Redelegate', a field to enter the amount of TRAC you wish to redelegate to another node will appear on the right side of the pop-up, as well as the select box, for selecting the other node — the one that will receive the TRAC. **Enter the amount of TRAC you want redelegated and select the node you want to redelegate to.**

<figure><img src="../../.gitbook/assets/Screenshot 2024-12-27 at 15.34.43.png" alt=""><figcaption></figcaption></figure>

{% hint style="warning" %}
You can stake your TRAC only to nodes that have less than 5,000,000 TRAC stake delegated to them.
{% endhint %}

{% hint style="info" %}
Only the nodes from the same network with the remaining capacity greater than zero will be shown in the 'Choose available node' select box.
{% endhint %}

7. **The redelegation process will require two transactions:** one to increase the allowance and another to confirm the redelegation contract interaction. Please be patient, as this can take some time.

<figure><img src="../../.gitbook/assets/Screenshot 2024-12-27 at 15.36.01.png" alt=""><figcaption></figcaption></figure>

8. Once both transactions are signed and confirmed, you should see a **'Stake redelegated successfully'** message appear.
9. To confirm that the process was successful, **check your TRAC delegation** by going to the 'My delegations' tab above the table with the nodes and verifying that your delegations are listed there. Additionally, ensure that the stake amount on the node has decreased and the amount on the other node has increased following the successful redelegation.\\

{% hint style="info" %}
If you encounter any issues during the staking process or require assistance, please get in touch with the OriginTrail community in [Discord](https://discord.gg/xCaY7hvNwD).
{% endhint %}
