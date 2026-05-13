---
description: >-
  Learn how to keep your DKG Node up to date with the latest features, bug
  fixes, and security patches. Includes guidance on safe upgrade practices so
  your node stays online and reliable.
---

# Set up your custom DKG Node fork & update flow

## **Keeping your DKG Node up to date**

The DKG Node is continuously evolving - new features, performance improvements, and security updates are released frequently. To stay current while keeping your custom modifications intact, you’ll maintain your own private fork of the DKG Node repository.

This setup allows you to:

* **Safely integrate official updates** without overwriting local changes.
* **Experiment and customize** your node codebase while staying compatible with the latest OriginTrail releases.
* **Stay stable and secure**, ensuring your node runs the most reliable version of the network software.

In this section, you’ll learn how to structure your repository, pull updates from the official source, and merge them into your project with confidence.

### How updates work <a href="#how-updates-work" id="how-updates-work"></a>

To receive new updates, you must maintain a **private fork** of the DKG Node monorepo. Your local project will use **two git remotes**:

* `origin` pointing to your **custom GitHub repository** (private or public)
* `upstream` pointing to the **official DKG Node repository**

This setup lets you safely pull in upstream changes while keeping your customizations.​

## How to set up your project with update flow <a href="#set-up-your-project-with-update-flow" id="set-up-your-project-with-update-flow"></a>

**1. Custom GitHub repository setup**

{% hint style="info" %}
Create a new repository on GitHub (private or public) where you'll store your DKG Node based project.
{% endhint %}

**2. Clone the official DKG Node repo**

```sh
git clone git@github.com:OriginTrail/dkg-node.git
```

**3. Rename the folder**

```sh
mv dkg-node your_project_namecd <your_project_name>
```

**4. Configure remotes**

Rename the original remote to `upstream`:

```sh
git remote rename origin upstream
```

**5. Add your private repo as `origin`**

```sh
git remote add origin git@github.com:your-username/<your-private-repo>.git
```

**6. Push to your private repo**

```sh
git push -u origin main
```

Your custom DKG Node repository is now set up with:

* `origin` pointing to your private fork
* `upstream` pointing to the official DKG Node

## Configure and start your custom DKG Node project

Once this setup process is complete, you are ready to configure and run your custom DKG Node using the `dkg-cli`. The `dkg-cli` provides automated installation, configuration management, and service control for your DKG Node. Detailed instructions on how to use `dkg-cli` to configure your node, and manage its services are available in the [**Installation**](../getting-started/decentralized-knowledge-graph-dkg.md#id-1-install-cli) page under "Getting started" section.

## Update your custom DKG Node project <a href="#id-2.-update-your-project" id="id-2.-update-your-project"></a>

When a new version of DKG Node is released, follow the process steps below to update your custom DKG Node project.

**1. Fetch the latest changes from upstream:**

```sh
git fetch upstream
```

**2. Merge upstream changes into your project**

```sh
git merge upstream/main
```

**3. Resolve conflicts (if any)**

Most projects will encounter differences between upstream and local changes. Review conflict markers in your code, then decide whether to keep, override, or blend changes.

**4. Push the updated code to your repo**

```sh
git push origin main
```

## You’re up to date

At this point, your codebase is synced with the latest official [DKG Node](https://github.com/OriginTrail/dkg-node) while keeping your customizations intact.

{% hint style="info" %}
⚠️ **Tips for smoother updates**

* Pull upstream updates **regularly** to avoid large conflict sets.
* Always test your DKG Node after merging updates to ensure compatibility
{% endhint %}
