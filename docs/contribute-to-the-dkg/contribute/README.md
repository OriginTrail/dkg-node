---
description: How to contribute to OriginTrail code repositories
---

# Contribution guidelines

OriginTrail is an ecosystem dedicated to **open-source software.** It is based on the principles of **neutrality, inclusiveness, and usability**.&#x20;

All project repositories, such as OT node, DKG clients, Houston, etc., are available on our official [GitHub](https://github.com/OriginTrail).

If you are new to OriginTrail development, there are guides in this documentation for getting your development environment set up.&#x20;

Please follow the below procedure to contribute new code or fixes:&#x20;

- Create a separate branch by branching the relevant branch (we generally follow [Gitflow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow))
- Create a pull request to **develop** (except for v6 contributions, then use the **v6/develop**) branch containing a description of what your code does and how it can be tested
- Provide at least a minimum of unit tests
- Please include descriptive commit messages

## Rules

There are a few basic ground rules for contributors:

1. **No `--force` pushes** or modifying the Git history in any way.
2. **Non-master branches** ought to be used for ongoing work.
3. **External API changes and significant modifications** ought to be subject to an **internal pull request** to solicit feedback from other contributors.
4. Internal pull requests to solicit feedback are _encouraged_ for any other non-trivial contribution but are left to the discretion of the contributor.
5. Contributors should attempt to adhere to the prevailing code style.

### Merging pull requests once CI is successful

- Each pull request **must be reviewed and approved by at least two OriginTrail core developers**
- A pull request that does not significantly change logic and is urgently needed may be merged after a non-author OriginTrail core developer has reviewed it thoroughly.
- All other PRs should sit for 48 hours in order to garner feedback.
- No PR should be merged until all review comments are addressed.

### Reviewing pull requests

When reviewing a pull request, the end goal is to suggest useful changes to the author. Reviews should finish with approval unless there are issues that would result in:

- Buggy behavior.
- Undue maintenance burden.
- Breaking with house coding style.
- Pessimization (i.e., reduction of speed as measured in the project benchmarks).
- Feature reduction (i.e., it removes some aspect of functionality that a significant minority of users rely on).
- Uselessness (i.e., it does not strictly add a feature or fix a known issue).

### Releases

Declaring formal releases remains the prerogative of the project maintainer(s).

## Changes to this arrangement

This is an experiment, and feedback is welcome! This document may also be subject to pull requests or changes by contributors where you believe you have something valuable to add or change.

## Heritage

These contributing guidelines are compiled with inspiration from "OPEN Open Source Project" guidelines for the Level project: [https://github.com/Level/community/blob/master/CONTRIBUTING.md](https://github.com/Level/community/blob/master/CONTRIBUTING.md) and Polkadot: [https://github.com/paritytech/polkadot/blob/master/CONTRIBUTING.md](https://github.com/paritytech/polkadot/blob/master/CONTRIBUTING.md)

## Contributor code of conduct

As contributors and maintainers of OriginTrail, we pledge to respect everyone who contributes by posting issues, updating documentation, submitting pull requests, providing feedback in comments, and any other activities.

Communication through any of our channels (GitHub, Discord, X, etc.) must be constructive and never resort to personal attacks, trolling, public or private harassment, insults, or other unprofessional conduct.

We promise to extend courtesy and respect to everyone involved in this project regardless of gender, gender identity, sexual orientation, disability, age, race, ethnicity, religion, or level of experience. We expect anyone contributing to the project to do the same.

If any member of the community violates this code of conduct, the maintainers of the OT Node project may take action, removing issues, comments, and PRs or blocking accounts as deemed appropriate.

If you are subject to or witness unacceptable behavior or have any other concerns, please email us.

## Questions, bugs, features

### Got a question or problem?

Do not open issues for general support questions. We want to keep GitHub issues for bug reports and feature requests. You’ll have much better chances of getting your question answered on [Discord](https://discord.gg/xCaY7hvNwD).

### Found an issue or bug?

If you find a bug in the source code, you can help us by submitting an issue to the appropriate GitHub repo. Even better, you can submit a pull request with a fix. We often have [bounty programs](broken-reference) as well; you might be eligible for rewards!

### Want a doc fix?

These docs are available publicly on this [GitHub repo](https://github.com/OriginTrail/dkg-docs). Feel free to propose updates through pull requests or open discussions through GitHub issues
