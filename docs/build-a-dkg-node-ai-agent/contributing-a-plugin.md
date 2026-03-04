---
description: >-
  Find out how to actively participate in improving the DKG Node itself — from
  submitting bug reports to contributing code, or plugins. Perfect for
  developers who want to help shape the ecosystem.
---

# Contributing a plugin

## Publish a plugin

We welcome contributions from the community! Whether you’ve built a plugin you want to share, fixed a bug, or improved the codebase, your contributions help the DKG Node and agents grow.

This guide explains how to contribute your work to the official DKG Node repository.

### How to contribute

#### 1. Fork the repo

1. Go to the [official DKG Node GitHub repo](https://github.com/OriginTrail/dkg-node).
2. Click **Fork** (top right).
3. This creates your own copy of the repo under your GitHub account.

#### 2. Clone your fork

```bash
git clone https://github.com/YOUR_USER/dkg-node.git
cd dkg-node
```

#### 3. Create a new branch

```sh
git checkout -b my-contribution
```

#### 4. Make your changes

- Implement your plugin, fix, or feature.
- Run tests if applicable.

#### 5. Push changes to your fork

```sh
git push origin my-contribution
```

#### 6. Open a Pull Request (PR)

1. Go to your fork on GitHub.
2. Click **Compare & pull request**.
3. On the PR page, make sure the branches are correct:
   - **base repository**: `OriginTrail/dkg-node`
   - **base**: `main` (or other target branch)
   - **compare**: `my-contribution`
4. Fill in a clear PR description. A good template:
   - **What**: brief summary of the change
   - **Why**: the problem it solves / motivation
   - **How**: key implementation details
   - **Tests**: how you verified it (commands, screenshots)
   - **Breaking changes/migration**: if any
5. Click **Create pull request**.

The OriginTrail core developer team will review your PR. If everything looks good, it will be merged and published. 🎉

### Creating an official DKG Node plugin

If you’ve built a plugin and want it included in the official DKG Node repo:

#### 1. Scaffold a plugin package

From the repo root, run:

```sh
turbo gen plugin
```

- Name it starting with `plugin-` (e.g. `plugin-custom`).
- A new package will be created at:

  ```sh
  packages/plugin-<your-name>/src/index.ts
  ```

#### 2. Develop your plugin

- Add your logic inside `index.ts`.
- Your package name will be:

  ```sh
  @dkg/plugin-<your-name>
  ```

#### 3. Submit via PR

- Commit your work.
- Push it to your fork.
- Open a pull request as described above.

Once reviewed and merged, your plugin will be published to **npm** under the `@dkg/` namespace for the community to use.

📖 To learn more about writing plugins, see [Customizing your DKG agent](customizing-your-dkg-agent.md).

### Working with packages in the DKG Node monorepo

The DKG Node repo is a **Turborepo** that contains multiple packages — not just plugins.

#### Explore packages

Run:

```sh
turbo ls
```

You’ll see entries like:

- `@dkg/agent` → Example of a DKG agent (Expo UI + MCP Server)
- `@dkg/plugins` → Utility package for creating DKG plugins
- `@dkg/eslint-config` → Shared ESLint configuration
- `@dkg/typescript-config` → Shared TypeScript configs
- `@dkg/plugin-oauth` → OAuth 2.1 module for the DKG Node

#### Add new packages

- Use `turbo gen` to generate new packages.
- New packages will be published under the `@dkg/` namespace once reviewed and merged.

### Repo utilities

The DKG Node monorepo comes with powerful tools preconfigured:

- [**Turborepo**](https://turborepo.com/) → build system with caching
- [**TypeScript**](https://www.typescriptlang.org/) → static type checking
- [**ESLint**](https://eslint.org/) **+** [**Prettier**](https://prettier.io) → code linting & formatting

#### Remote caching with [Vercel](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache)

By default, builds are cached locally.\
Enable [**remote caching**](https://turborepo.com/docs/core-concepts/remote-caching) to share build caches across your team or CI/CD:

```sh
npx turbo login     # authenticate with your Vercel account
npx turbo link      # link this repo to remote cache
```

Learn more in Turborepo docs.

---

### Further resources

👥 OriginTrail Discord server

📖 **Expo framework:**

- [Expo docs](https://docs.expo.dev/)
- [Video tutorials](https://www.youtube.com/@ExpoDevelopers/videos)

⚡**Turborepo:**

- [Tasks](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.com/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.com/docs/reference/configuration)
- [CLI Usage](https://turborepo.com/docs/reference/command-line-reference)
