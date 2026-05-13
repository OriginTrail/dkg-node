# Customize & build with the Edge Node

Now that you've set up the boilerplate project with all the essential components, it's time to explore the customization options. Each service in the app — interface, API, Knowledge Mining API, dRAG API, and Authentication Service — is **open** **source** and **fully** **customizable**. You can fork any of these repositories to modify them to better suit your specific requirements.

This section will focus primarily on customizing the **Knowledge Mining API** and **dRAG API**, two core services that empower you to process data and build Decentralized Retrieval-Augmented Generations (dRAGs) based on Knowledge Assets.

## Introduction to customization

Each service is hosted in a separate GitHub repository, enabling you to fork the code, make your changes, and deploy your customized versions. The default setup provides a boilerplate project with out-of-the-box functionality, serving as a solid foundation for customization.

Before diving into how you can customize Edge Node services, it's important to highlight the role of the Authentication Service, which acts as the connecting hub between all components. This service manages the `UserConfig` data, including both required and optional parameters that are shared across all services to ensure the system functions cohesively.

Users can add custom variables to the `UserConfig` table, making them accessible across all services. For instance, if a use case requires an external tool with an authentication key, the `UserConfig` table is the ideal place to store this key, ensuring that the variable is available to all services in the system.

## Local environment setup with forked services

To begin customizing and building your own solution using the OriginTrail Edge Node stack, we recommend the following local development setup:\\

1.  #### Fork Core Edge Node Repositories

    In order to fully tailor the Edge Node to your specific use case, it is recommended that you **fork the following components** into your own GitHub account:

    1. **Edge Node Knowledge Mining API**\
       Handles the ingestion and transformation of your datasets into Knowledge Assets.\
       👉 Fork this service to add new file format support and custom data transformation logic.
    2. **Edge Node DRAG API**\
       Provides search, retrieval, and chat functionality based on Knowledge Assets.\
       👉 Fork this to extend the retrieval-augmented generation (RAG) logic or customize how assets are queried.
    3. **Edge Node API**\
       Main backend orchestrator connecting your UI, authentication, and data pipelines.\
       👉 Fork this if you want to modify business logic, expose new routes, or integrate additional microservices.
    4. **Edge Node UI**\
       The user-facing interface of the Edge Node.\
       👉 Fork this to customize branding, UX, workflows, or connect it with your own backend services.\\
2. #### Authentication Service (Optional Fork)
   1. **Edge Node Authentication Service**\
      This handles user sessions and tokens.\
      Recommended to use as-is for most cases to keep things simple and aligned with best practices.\
      🛠️ Optional: You may fork this if you need:
      1. Custom authentication methods (e.g., biometric login, enterprise SSO)
      2. Integration with external identity providers
      3. Custom logic for Verifiable Credential issuance or DID resolution
3.  #### Forked Repositories Setup

    Once you’ve successfully forked the core Edge Node repositories and tested the default setup using the official public repos, you’ll need to **clean your local environment** before installing your customized versions.

    1.  **Prune Default Services**

        To avoid conflicts and ensure a clean state, run the following command from the root of your Edge Node setup:\
        \
        `bash edge-node-installer/reset-env.sh`\
        \
        After pruning the default Edge Node setup, your environment will be reset:

        1. All previously cloned **Edge Node service repositories** will be deleted
        2. All **Edge Node databases** will be dropped\\
    2. **Switch to Your Forked Repositories**
       1. **Open your `.env` file** located at the root of the project.
       2. Replace the official repository URLs with the links to your **forked repositories.**\\
    3. **Install Your Custom Edge Node**
       1. Run Edge node installer script which will install services based on your forked repos.
       2. If your Edge node is set on MacOS, execute following script to run your services:\
          \
          `bash edge-node-installer/run-dev.sh`

## Common customization scenarios

### Creating a custom knowledge mining pipeline

The **Knowledge Mining API** is one of the most powerful services in the Edge Node, offering builders the flexibility to create custom processing pipelines without limitations. Registering new pipelines is straightforward, and the service is built in Python, a versatile environment well-suited for **data** **processing**, **AI** **tools**, **models**, and more. It’s up to the builder to decide how to parse the input data from incoming requests. The only requirement is that the pipeline outputs data in JSON-LD format, as this is necessary for publishing it as a Knowledge Asset on the DKG.

* **Forking the repository**
  * Start by **forking** the Knowledge Mining API repository from GitHub. This creates a copy of the original repository under your GitHub account, which you can modify as needed.
  *   Clone your forked repository locally:

      ```bash
      git clone https://github.com/your-username/edge-node-knowledge-mining.git
      ```
* **Creating your pipeline file**
  * To create a new processing pipeline, add a new file in the "dags" folder of your project.
  * As a starting point, you can use the existing example file `dags/exampleDAG.py`. Duplicate this file and modify it as needed:
    * The example pipeline serves as a basic illustration. It performs two tasks:
      * Extracting parameters from the incoming request.
      * Converting the input file to JSON-LD format.
* **Building the pipeline**
  * There are no limitations on how you build your pipeline. You can:
    * Install additional packages as needed.
    * Use external APIs for data enrichment.
    * Incorporate any processing logic to transform incoming data into the required graph structure (JSON-LD).
  * **Requirement:** The pipeline must output data in JSON-LD format (in the same format as existing mining pipelines) so that the Edge Node API can process it and pass it to the Publish Service for creating a Knowledge Asset on the DKG

{% hint style="info" %}
A **DAG** defines the execution order of tasks within a **pipeline**, while a **pipeline** is the entire data processing workflow. A pipeline can contain multiple DAGs, but a DAG is just one part of a pipeline.

* All your **DAGs** were initially paused.
{% endhint %}

* **Starting the pipeline**
  * **Restart the services:** After creating the pipeline (DAG), the Edge Node Knowledge Mining API should be restarted
    * _python app.py_ and _airflow scheduler_ (scripts mentioned in the previous chapter, required to be running in order to use the knowledge mining service)
    * optionally: If _airflow webserver_ is used, it should also be restarted
  * **Unpause** your pipeline\
    `airflow dags unpause ${YOUR_DAG_NAME}`\
    \&#xNAN;_e.g. If your pipeline filename is xlsx\_to\_jsonld.py, unpause command should be "airflow dags unpause xlsx\_to\_jsonld"_\
    \
    **NOTE:** If you are using Airflow webserver, you should be able to see your pipeline on http://localhost:8080 (or any other port you selected for the service) inside of "unpaused DAGS"
* **Registering the pipeline**
  * In order for the Edge Node to **recognize** and **use** your new pipeline for certain filetypes, it needs to be registered in your main **UserConfig** **table** inside of the Authentication Service MYSQL DB (edge-node-auth-service)
  * By default, the Edge Node will offer three variables for three main file types
    * _kmining\_json\_pipeline\_id_ — this pipeline will be used when the input file MIME type is detected as **"application/json"**
    * _kmining\_pdf\_pipeline\_id_ — this pipeline will be used when the input file MIME type is detected as **"application/pdf"**
    * _kmining\_csv\_pipeline\_id_ — this pipeline will be used when the input file MIME type is detected as **"text/csv"**
  * If your pipeline handles one of the above file types, simply replace the default pipeline with your custom one. **Here are some ideas:**
    * **Convert science paper PDFs to JSON-LD using a bibliographic ontology**\
      Extract metadata from science paper PDFs, such as title, authors, publication date, and references, and convert the data into JSON-LD following a bibliographic ontology like BIBO. This allows for structured, machine-readable representation of academic papers for easier citation management and searchability.
    * **Convert supply chain Excel documents to JSON-LD using GS1 standard ontology**\
      Parse supply chain-related data from Excel files (e.g., product lists, inventory records) and convert it into JSON-LD using the GS1 standard ontology.
    * **Convert images to JSON-LD using OCR**\
      Use Optical Character Recognition (OCR) to extract text and metadata from image files and represent it as JSON-LD.
    * **Convert videos to Knowledge Assets by transcribing the audio and extracting key points**\
      Transcribe the audio from videos and extract key points or insights, then represent this information as JSON-LD knowledge assets.
  * If you need to support a different file type:
    * Create a new variable for the file type, e.g., `kmining_xlsx_pipeline_id`
    * adapt the code in [Edge Node API - kMiningService](https://github.com/OriginTrail/edge-node-api/blob/main/services/kMiningService.js) to handle the new variable based on the input file's MIME type
* You should now be ready to test your setup. Visit the Edge Node interface, go to the "Contribute" page, import a file, and verify that the pipeline processes it correctly.

{% hint style="info" %}
Every **Knowledge Asset** consists of both a **private** and a **public part**, both of which can be published. Regarding publishing private and/or public data, you should note:

1. When you query the node, you will be able to retrieve both the private and public parts (use `contentType: 'all'` in the `get` function).
2. Anyone with access to the node will be able to view the private knowledge. If you prefer to keep it private, simply whitelist yourself.
{% endhint %}

### Creating a custom dRAG pipeline

Now that you have created your processing pipelines and published Knowledge Assets on the DKG, you can customize the dRAG (Decentralized Retrieval-Augmented Generation) service to build your own decentralized RAGs. The dRAG service is built in Node.js, providing a flexible environment that supports integrations with LLMs, AI tools, and more, giving you limitless possibilities to customize your RAGs.

The native query language for interacting with the DKG is SPARQL, as we use a triple store for data storage. You can combine SPARQL, LLMs, vector databases, or other tools to extract and process data from the DKG, refine the results, and deliver answers to natural language questions. The dRAG service functions like any other RAG but with the added benefits of decentralized data sources from the DKG.

* **Forking the repository**
  * Start by **forking** the dRAG API repository from GitHub. This creates a copy of the original repository under your GitHub account, which you can modify as needed.
  *   Clone your forked repository locally:

      ```bash
      git clone https://github.com/your-username/edge-node-drag.git
      ```
* **Creating your dRAG**
  * The app currently contains two dRAGs as a demonstration of how natural language questions can be understood, processed, and answered using SPARQL and vector similarity search
  * Creating a new dRAG is basically creating a new API route in the app, and those steps are recommended but not mandatory:\
    NOTE: (_you can create your own path as long as they are compatible with Edge Node interface, which also can be customized by your needs_)
    * Create a new Controller in the controllers directory
    * Create your dRAG method in Controller
    * Register route in route.js using created Controller and dRAG method
* **Building a new dRAG**
  * The dRAG service is highly customizable and supports various tools and libraries that can help you extract meaningful insights from the DKG. You can:
    * Combine SPARQL queries with AI-powered analysis tools to answer complex natural language questions.
    * Use LLMs for text generation or summarization based on the retrieved data.
    * Integrate vector databases to enhance search capabilities with similarity search or semantic search.
  * **Requirement:** The current version of the Edge Node interface works with the defined response that you can see in the two provided examples. It contains two parameters in response:
    * **Answer** — Natural language answer on defined questions
    * **Knowledge Assets** — This will be used to show based on which Knowledge Assets the answer is created\
      NOTE: As mentioned earlier, you can fork and update [Edge Node Interface](https://github.com/OriginTrail/edge-node-interface) as well and adapt the responses of your dRAGs to be compatible with the adapted interface.
* **Integration with interface**
  * As mentioned earlier, the AI Assistant is available in the current version of the Edge Node interface. To connect your dRAG to the interface, all you need to do is update the route used for fetching answers.
* **Potential dRAG ideas:**
  * **Teach an LLM to convert natural language to SPARQL:** Leverage few-shot learning to train an LLM to convert natural language queries into SPARQL, tailored to your specific ontology and data model. Provide a set of example queries and responses to guide the model's understanding. (Example: `exampleSparqlController.js`)
  * **Integrate vector search with reranking for precision:** Use a vector database to retrieve content similar to the user's question, then refine the results with AI-based reranking tools to improve relevance and accuracy. This can enhance both the speed and precision of the search. (Example: `exampleVectorController.js`)
  * **Intent-matching AI for predefined SPARQL queries:** Create a set of predefined SPARQL queries and use an intent-matching algorithm powered by AI to map user queries to the most relevant SPARQL queries. This allows for efficient querying with minimal overhead.
  * **Feedback-loop-based SPARQL refinement:** Combine the LLM's natural language to SPARQL conversion with a feedback loop, in which the AI iteratively enhances the generated SPARQL queries, ensuring they align with the ontology and avoid errors.
  * **Hybrid search — Combine vector and symbolic search:** Use a hybrid approach in which vector search (for semantic similarity) and symbolic search (e.g., SPARQL) work in tandem. Balancing structured queries with open-ended search results in this way can help ensure both accuracy and broad coverage.
  * **Ontology-aware LLM fine-tuning:** Create a system to fine-tune a large language model (LLM) specifically on a given ontology. This approach involves providing the LLM with structured data from the ontology, including relationships, entities, and definitions, so it can learn to generate responses that align with the specific concepts and rules of the ontology. Then, use the trained model to formulate SPARQL queries based on the natural language.
* You should now be ready to test your setup. Visit the Edge Node interface, go to the "AI Assistant" page, ask a question, and verify that your dRAG can answer it based on your custom logic.\\

| Feature           | dRAG                                                                                      | Pipeline                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Purpose**       | Retrieves and generates responses based on decentralized knowledge                        | Processes and transforms data from input to output                                             |
| **Functionality** | Uses SPARQL, AI, and vector search to answer queries                                      | Automates data processing steps like extraction, transformation, and storage                   |
| **Workflow**      | Queries the Decentralized Knowledge Graph (DKG), processes results, and generates answers | Sequentially processes data through multiple steps (e.g., extraction, transformation, storage) |
| **Components**    | Includes query execution, LLM integration, and knowledge retrieval                        | Can consist of multiple DAGs, data transformation steps, and processing logic                  |
| **Output**        | AI-generated answers + linked Knowledge Assets                                            | Structured, transformed, or enriched data for further use                                      |

### Customizing other services

Since all services are open source, you have the freedom to customize any component to suit your specific needs. Your contributions are highly encouraged! For example, if you need to implement a new authentication mechanism, you can add it directly to the Authentication Service and seamlessly integrate it across the other components.

The open-source nature not only allows you to tailor the system to your requirements but also gives you the opportunity to share your improvements with the community, potentially influencing future features and enhancing the Edge Node ecosystem. Whether you're adding new functionality, optimizing existing features, or experimenting with innovative integrations, your contributions can help drive the evolution of the platform.
