# Staking cap & outstanding network rewards release

**TL;DR**

* We’re **increasing the staking cap from 5,000,000 $TRAC to 10,000,000 $TRAC to accommodate more stake delegations** on the best-performing DKG nodes.
* To ensure staking doesn’t outweigh other performance drivers (e.g., node publishing factor), we will **publish an RFC with an updated rewards formula before the updated staking cap goes live**. The formula update is planned for the **end of the next epoch (around February 10)**.
* With the last epoch of previously allocated V6 rewards expiring on January 9th (today), the conditions to begin **releasing outstanding network rewards are met**. The rewards deployment is scheduled for **the end of epoch 13 (around February 10)**.

#### What’s changing and why

As the network continues to grow, we’re seeing increased delegation demand—especially toward the best-performing DKG nodes. To better accommodate this and reduce delegation bottlenecks, we’re updating the staking parameters used for delegations.

**1) Staking cap increases to 10,000,000 $TRAC**

To support more stake delegations on top-performing nodes, the staking cap on the DKG nodes will increase from 5,000,000 $TRAC to 10,000,000 $TRAC.

This change is intended to make it easier for delegators to stake with high-performing nodes without hitting the previous threshold as quickly.

**2) Rewards formula update will be introduced via RFC**

We also want to maintain a balanced incentive structure—where staking is important, but does not overshadow other network performance factors, such as the node publishing factor.

To retain that balance:

* We will introduce a change to the rewards formula via a public RFC (Request for Comments) before implementation.
* The goal is transparency and feedback prior to rollout.
* The formula change is planned to be implemented at the end of the next epoch (around February 10).

**3) Outstanding network rewards will be released after a snapshot**

There are outstanding network rewards to be released. To do this cleanly and fairly:

* After the current epoch ends on January 10, we will take a network snapshot.
* That snapshot will be used to implement the distribution.
* The outstanding network rewards will be released at the end of the next epoch (around February 10).



#### Key dates and timeline

* **January 9 - Epoch 12 ends**&#x20;
  * A network snapshot will be taken at the end of the epoch.
* **\~February 10 (at end of epoch 13)**
  * Outstanding network rewards released
  * Formula update implemented (after the RFC is published and reviewed)
  * Staking cap increased on DKG nodes from 5M to 10M $TRAC.

_(All “around” dates are aligned to epoch timing.)_

#### What this means for delegators

* More capacity to delegate to the best-performing DKG nodes, due to the higher cap (10M $TRAC).
* No immediate action is required purely because of this announcement — your delegation remains as-is unless you choose to adjust it.
* If you care about how staking weight vs. publishing/performance factors are balanced, you’ll be able to review and comment on the upcoming RFC before the formula change is implemented.

#### What this means for node operators

* The network is **reinforcing a performance-based model: stake matters, and publishing/performance factors continue to matter**.
* Please **keep an eye out for the RFC** outlining the formula update, and be ready to provide feedback.
* The snapshot and rewards release timeline is now clearly defined: snapshot after Jan 9, distribution around Feb 10.
