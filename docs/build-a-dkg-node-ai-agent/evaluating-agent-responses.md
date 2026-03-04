---
description: A step-by-step guide to evaluating your agent responses
---

# Evaluating agent responses

Evaluating your DKG Agent is a recommended quality control step which helps you understand how well your custom agent performs on various retrieval metrics. The DKG Node comes together with the premier AI Agent RAG evaluation framework, called RAGAS, which you can use to evaluate how well your agent responds.

## What is RAGAS, and what is it used for?

[RAGAS](https://www.ragas.io/) (Retrieval Augmented Generation Assessment) is a framework for evaluating how well an AI agent answers questions, especially those that use knowledge bases or document retrieval. Think of it as a quality control system that checks whether your agent is doing its job properly. It measures if the agent finds the right information from available knowledge, gives accurate and relevant answers, stays truthful to the source material without making things up, and actually addresses what the user asked.\
For the DKG Node, RAGAS helps ensure that the DKG Agent provides high-quality, reliable answers about decentralized knowledge graphs, blockchain publishing, and related topics. It's essentially an automated testing system that ensures your AI isn't hallucinating or giving irrelevant responses.

### RAGAS metrics explained

Each evaluation measures these key aspects:

#### **1. Context metrics (How well does the agent find information)**

- **Context precision** — Is the agent pulling the right information from our knowledge base?
- **Context recall** — Did the agent find all the relevant information available?
- **Context relevance** — Is the information the agent retrieved actually useful for the question?

#### **2. Answer metrics (How well does the agent respond)**

- **Answer relevance** — Does the answer actually address what was asked?
- **Faithfulness** — Is the answer based on facts from our knowledge base (no hallucinations)?
- **Answer similarity** — How close is the answer to what we expect?
- **Answer correctness** — Is the answer factually correct?

{% hint style="info" %}
Each metric gets a score from 0-1, and you can set minimum thresholds (e.g., 0.8 = 80%) that the answers must meet to pass.
{% endhint %}

### Where to find questions

The test questions are stored in:&#x20;

1. Navigate to your project root directory
2. Open apps/agent/tests/ragas/questionsAnswers/
3. Open dkg-node-evaluation-dataset.json

```
apps/agent/tests/ragas/questionsAnswers/dkg-node-evaluation-dataset.json
```

<figure><img src="../.gitbook/assets/Screenshot 2025-11-05 at 15.21.06.png" alt="" width="287"><figcaption></figcaption></figure>

The JSON file contains an array of test cases, each with questions, answers, ground_truth, and context. All fields are already populated with examples for DKG Node, which you can modify or replace to fit your chatbot's specific use case.

### What each field means

Think of the dataset as a set of four parallel lists that work together:

- **Questions** are the prompts you're testing ("What is DKG Node?"),&#x20;
- **Ground_truths** are your ideal answers — the gold standard you're measuring against,&#x20;
- **Contexts** are the documentation or knowledge your AI should be using to answer,&#x20;
- **Answers** should contain actual responses from your DKG Node for each question.

### Adding new questions step by step

Adding a new test question is straightforward:&#x20;

- Start by putting your question in the questions array.&#x20;
- Then write what you consider the perfect answer and add it to ground_truths.&#x20;
- Next, include any relevant documentation in the contexts array — this is the source material your AI should reference.&#x20;
- For the answers field, you need to manually add the actual response from your DKG Node. You can get this by asking your DKG Node the question directly and copying the response, or you can run a test session to see what it generates, then add that to the array.&#x20;

Just remember: all four arrays need to stay in sync. The first item in each array corresponds to the same test case.

### Configuration settings&#x20;

Edit \`tests/ragas/config.ts\` to change:

- **Which metrics to run** — Enable/disable specific RAGAS metrics
- **Score thresholds** — Set minimum passing scores (e.g., require 80% minimum)
- **LLM model** — Choose which AI model evaluates the responses
- **Browser automation settings** — Playwright timeouts and behavior

### Setup and installation

```sh
# Install dependencies and build the project
npm install
npm run build

# Run complete evaluation (starts servers + generates report + opens dashboard)
npm run ragas
```

If you want to run individual parts:

```sh
# Just run the evaluation (servers must be running)
npm run test:ragas

# Show results from last evaluation
npm run test:ragas:results

# Open dashboard (shows cached results)
npm run test:ragas:dashboard
```

- **Update login credentials** in `apps/agent/tests/ragas/dkg-node-client.ts`:

```typescript
// Lines 28-29 and 264-265
email: "admin",           // Change to your email/username
password: "adminN131!"    // Change to your password
```

### The dashboard

When you run npm run ragas, a web dashboard opens at http://localhost:3001 showing:

- **Overall score** — How well the DKG Node agent is performing (0-100%)
- **Metric breakdown** — Individual scores for each RAGAS metric
- **Question-by-question analysis** — Detailed view of each failed test question with:
  - The question asked
  - DKG Node's actual answer
  - Expected answer
  - Which metrics failed and why
  - &#x20;Real-time Results — Dashboard auto-refreshes as new evaluations complete
