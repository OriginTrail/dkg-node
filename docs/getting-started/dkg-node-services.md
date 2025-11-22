---
description: >-
  Learn how to navigate and use the DKG Node’s built-in web interfaces and APIs.
  This section helps you manage your node, interact with agents, and explore
  services without writing complex code.
---

# DKG Node Services

## Running your DKG Node in development mode

You will be running your DKG Node in **development mode** while building, experimenting, and customizing your DKG Node, before deploying it in production. In this mode, the system automatically reloads on code changes, streams real-time logs, and gives you immediate feedback as you work.

From the project root:

```bash
cd ~/dkg-node && npm run dev
```

This will:

* Automatically reload your node whenever you change the code.
* Stream live logs across all running services.
* Help you debug and iterate quickly in a local environment.

{% hint style="info" %}
### Troubleshooting

If `npm install` fails, try:

```bash
rm -rf node_modules package-lock.json
npm install
```

Also confirm your Node.js version is **v22+**.
{% endhint %}

## Local services & dashboards

Once your dev server is up (`npm run dev`), several powerful tools become available through your browser. These interfaces let you **manage, inspect, and debug** every part of your DKG Node.

### **DKG Node & Agent UI**

[**http://localhost:8081/**](http://localhost:8081/)

This is where the prebuilt **template** **UI is** for your DKG Node. From here, you can:

* Monitor the overall health and status of your node.
* View and manage installed plugins.
* Interact directly with your **DKG Agent** (the built-in AI agent).
* Access settings, credentials, and configuration options.
* Publish, query, and verify Knowledge Assets through a graphical interface - no code required.

Think of this as your **command center** for operating and experimenting with your node.

### **DKG MCP Server**

[**http://localhost:9200/mcp**](http://localhost:9200/mcp)

This is the **Model Context Protocol (MCP) server endpoint** your node exposes.\
It allows:

* **AI agents and external applications** to connect to your node.
* Execution of tools and APIs provided by installed plugins.
* Structured communication between your node and LLMs or external services.

If your DKG Node is the “brain,” the MCP server is the **communication layer** - it’s what lets AI systems talk to your node programmatically.

### **Swagger UI (API Explorer)**

[**http://localhost:9200/swagger**](http://localhost:9200/swagger)

The Swagger dashboard provides **interactive documentation** for all the REST APIs your node exposes.\
Here, you can:

* Explore every available endpoint.
* Understand request/response formats.
* Test API calls directly from the browser.

This is especially helpful if you’re integrating the DKG Node into a larger application or developing custom tools.

### **Operational database viewer (Drizzle Studio)**

[**https://local.drizzle.studio**](https://local.drizzle.studio)

Drizzle Studio is a visual interface for inspecting the **internal databases** your DKG Node uses.\
It allows you to:

* Browse tables and view stored data.
* Inspect Knowledge Assets before and after they’re published.
* Debug database writes and schema changes.

{% hint style="danger" %}
If you’re using the Brave browser, please disable Shields when accessing Drizzle Studio - otherwise you may not be able to view the database records.
{% endhint %}
