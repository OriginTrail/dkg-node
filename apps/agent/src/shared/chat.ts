import type {
  AIMessageChunk,
  MessageFieldWithRole,
} from "@langchain/core/messages";
import type {
  BaseFunctionCallOptions,
  ToolDefinition,
} from "@langchain/core/language_models/base";
import type { ToolCallChunk } from "@langchain/core/messages/tool";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type { ToolDefinition };
export type ToolInfo = {
  name: string;
  title?: string;
  description?: string;
  args?: ToolDefinition["function"]["parameters"];
};
export type ToolCallsMap = Record<
  string,
  {
    input?: unknown;
    output?: unknown;
    status: "init" | "loading" | "success" | "error" | "cancelled";
    error?: string;
  }
>;

export type CompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  options?: BaseFunctionCallOptions;
};

export type ChatMessage = MessageFieldWithRole & {
  content: AIMessageChunk["content"];
  tool_calls?: AIMessageChunk["tool_calls"];
};

export type ToolCall = NonNullable<AIMessageChunk["tool_calls"]>[number];
export type ToolCallResultContent = CallToolResult["content"];

export const toContents = (content: ChatMessage["content"]) =>
  typeof content === "string" ? [{ type: "text", text: content }] : content;

export type ChatMessageContents = ReturnType<typeof toContents>;

export enum LLMProvider {
  OpenAI = "openai",
  Groq = "groq",
  Anthropic = "anthropic",
  GoogleGenAI = "google-genai",
  MistralAI = "mistralai",
  XAI = "xai",
  SelfHosted = "self-hosted",
}

export const isValidLLMProvider = (
  llmProvider: string,
): llmProvider is LLMProvider =>
  Object.values(LLMProvider).includes(llmProvider as any);

export const getLLMProviderApiKeyEnvName = (llmProvider: LLMProvider) => {
  switch (llmProvider) {
    case LLMProvider.OpenAI:
      return "OPENAI_API_KEY";
    case LLMProvider.Groq:
      return "GROQ_API_KEY";
    case LLMProvider.Anthropic:
      return "ANTHROPIC_API_KEY";
    case LLMProvider.GoogleGenAI:
      return "GOOGLE_API_KEY";
    case LLMProvider.MistralAI:
      return "MISTRAL_API_KEY";
    case LLMProvider.XAI:
      return "XAI_API_KEY";
    case LLMProvider.SelfHosted:
      return "LLM_URL";
    default:
      throw new Error(`Unsupported LLM provider: ${llmProvider}`);
  }
};

const llmProviderFromEnv = async () => {
  const provider = process.env.LLM_PROVIDER || LLMProvider.OpenAI;
  if (!isValidLLMProvider(provider)) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
  const model = process.env.LLM_MODEL;
  if (!model) {
    throw new Error(
      "LLM_MODEL environment variable is not set. Please define it in your .env file",
    );
  }
  const temperature = Number(process.env.LLM_TEMPERATURE || "0");
  if (isNaN(temperature)) {
    throw new Error(`Invalid LLM temperature: ${temperature}`);
  }

  switch (provider) {
    case LLMProvider.Groq:
      return import("@langchain/groq").then(
        ({ ChatGroq }) => new ChatGroq({ model, temperature }),
      );
    case LLMProvider.Anthropic:
      return import("@langchain/anthropic").then(
        ({ ChatAnthropic }) => new ChatAnthropic({ model, temperature }),
      );
    case LLMProvider.GoogleGenAI:
      return import("@langchain/google-genai").then(
        ({ ChatGoogleGenerativeAI }) =>
          new ChatGoogleGenerativeAI({ model, temperature }),
      );
    case LLMProvider.MistralAI:
      return import("@langchain/mistralai").then(
        ({ ChatMistralAI }) => new ChatMistralAI({ model, temperature }),
      );
    case LLMProvider.XAI:
      return import("@langchain/xai").then(
        ({ ChatXAI }) => new ChatXAI({ model, temperature }),
      );
    case LLMProvider.SelfHosted:
      return import("@langchain/openai").then(
        ({ ChatOpenAI }) =>
          new ChatOpenAI({
            model,
            temperature,
            configuration: {
              baseURL:
                (process.env.LLM_URL || "http://localhost:11434") + "/v1",
              apiKey: "_",
            },
          }),
      );
    case LLMProvider.OpenAI:
    default:
      return import("@langchain/openai").then(
        ({ ChatOpenAI }) => new ChatOpenAI({ model, temperature }),
      );
  }
};

export const llmProvider = async () => {
  const s = globalThis as typeof globalThis & {
    llmProvider?: Awaited<ReturnType<typeof llmProviderFromEnv>>;
  };

  if (!s.llmProvider) s.llmProvider = await llmProviderFromEnv();
  return s.llmProvider;
};

export const processCompletionRequest = async (req: Request) => {
  const body: CompletionRequest = await req.json();
  const provider = await llmProvider();
  const res = await provider.invoke(
    [
      {
        role: "system",
        content: process.env.LLM_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
      },
      ...body.messages,
    ],
    {
      ...body.options,
      tools: body.tools,
    },
  );
  return Response.json({
    role: "assistant",
    content: res.content,
    tool_calls: res.tool_calls,
  } satisfies ChatMessage);
};

export const makeCompletionRequest = async (
  req: CompletionRequest,
  opts?: {
    fetch?: typeof fetch;
    bearerToken?: string;
  },
) =>
  (opts?.fetch || fetch)(new URL(process.env.EXPO_PUBLIC_APP_URL + "/llm"), {
    body: JSON.stringify(req),
    headers: {
      Authorization: `Bearer ${opts?.bearerToken}`,
      // Itentionally omit the 'Content-Type' header
      // Because it breaks the production build
      //
      // "Content-Type": "application/json",
    },
    method: "POST",
  }).then((r) => {
    if (r.status === 200) return r.json() as Promise<ChatMessage>;
    if (r.status === 401) throw new Error("Unauthorized");
    if (r.status === 403) throw new Error("Forbidden");
    throw new Error(`Unexpected status code: ${r.status}`);
  });

// --- SSE Streaming ---

export type StreamCallbacks = {
  onDelta: (content: string) => void;
  onToolCalls: (toolCalls: ToolCall[]) => void;
  onDone: () => void;
  onError: (message: string) => void;
};

type SSEEvent =
  | { event: "delta"; data: { content: string } }
  | { event: "tool_calls"; data: { tool_calls: ToolCall[] } }
  | { event: "done"; data: Record<string, never> }
  | { event: "error"; data: { message: string } };

function writeSSE(
  res: { write: (chunk: string) => void; flush?: () => void },
  event: SSEEvent,
) {
  res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
  // Flush buffered data to the network immediately (compression middleware adds this)
  if (typeof res.flush === "function") res.flush();
}

/**
 * Server-side: streams an LLM completion over SSE using Express req/res.
 * Tool call chunks are accumulated and sent as a batch after the stream ends.
 * Falls back to `.invoke()` if `.stream()` fails (e.g. SelfHosted providers).
 */
export const processStreamingCompletion = async (
  req: { body: CompletionRequest },
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    flushHeaders: () => void;
    write: (chunk: string) => boolean;
    flush?: () => void;
    end: () => void;
    on: (event: string, cb: () => void) => void;
    socket?: { setNoDelay?: (noDelay: boolean) => void } | null;
  },
) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Disable Nagle's algorithm for real-time chunk delivery
  res.socket?.setNoDelay?.(true);

  let clientDisconnected = false;
  res.on("close", () => {
    clientDisconnected = true;
  });

  try {
    const body = req.body;
    if (!body?.messages) {
      writeSSE(res, {
        event: "error",
        data: { message: "Invalid request: missing messages" },
      });
      res.end();
      return;
    }

    const provider = await llmProvider();
    const messages = [
      {
        role: "system" as const,
        content: process.env.LLM_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
      },
      ...body.messages,
    ];
    const options = { ...body.options, tools: body.tools };

    // Track whether any content was sent to the client
    let hasSentContent = false;

    try {
      const stream = await provider.stream(messages, options);

      // Accumulate tool call chunks by index
      const toolCallChunksByIndex = new Map<
        number,
        { name: string; args: string; id: string }
      >();

      for await (const chunk of stream) {
        if (clientDisconnected) break;

        // Emit text content
        const content = chunk.content;
        if (typeof content === "string" && content.length > 0) {
          writeSSE(res, { event: "delta", data: { content } });
          hasSentContent = true;
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (
              part &&
              typeof part === "object" &&
              "type" in part &&
              part.type === "text" &&
              "text" in part &&
              typeof part.text === "string" &&
              part.text.length > 0
            ) {
              writeSSE(res, { event: "delta", data: { content: part.text } });
              hasSentContent = true;
            }
          }
        }

        // Accumulate tool call chunks
        if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
          for (const tcc of chunk.tool_call_chunks as ToolCallChunk[]) {
            const idx = tcc.index ?? 0;
            const existing = toolCallChunksByIndex.get(idx);
            if (existing) {
              if (tcc.name) existing.name += tcc.name;
              if (tcc.args) existing.args += tcc.args;
              if (tcc.id) existing.id += tcc.id;
            } else {
              toolCallChunksByIndex.set(idx, {
                name: tcc.name ?? "",
                args: tcc.args ?? "",
                id: tcc.id ?? "",
              });
            }
          }
        }
      }

      // Emit accumulated tool calls
      if (toolCallChunksByIndex.size > 0) {
        const toolCalls: ToolCall[] = [];
        for (const [, tc] of toolCallChunksByIndex) {
          let args: Record<string, unknown> = {};
          try {
            args = tc.args ? JSON.parse(tc.args) : {};
          } catch {
            // Malformed JSON from partial streaming — send raw
            args = {};
          }
          toolCalls.push({
            name: tc.name,
            args,
            id: tc.id,
            type: "tool_call",
          });
        }
        writeSSE(res, {
          event: "tool_calls",
          data: { tool_calls: toolCalls },
        });
      }

      writeSSE(res, { event: "done", data: {} });
    } catch (streamError) {
      if (hasSentContent) {
        // Partial content was already sent — don't re-invoke and risk
        // duplicated/mixed output. Send an error so the UI can recover.
        writeSSE(res, {
          event: "error",
          data: {
            message:
              "Stream interrupted — please retry your message",
          },
        });
      } else {
        // No content sent yet — safe to fallback to a full invoke
        try {
          const result = await provider.invoke(messages, options);
          const content = result.content;
          if (typeof content === "string") {
            writeSSE(res, { event: "delta", data: { content } });
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if (
                part &&
                typeof part === "object" &&
                "type" in part &&
                part.type === "text" &&
                "text" in part &&
                typeof part.text === "string"
              ) {
                writeSSE(res, {
                  event: "delta",
                  data: { content: part.text },
                });
              }
            }
          }
          if (result.tool_calls && result.tool_calls.length > 0) {
            writeSSE(res, {
              event: "tool_calls",
              data: { tool_calls: result.tool_calls as ToolCall[] },
            });
          }
          writeSSE(res, { event: "done", data: {} });
        } catch (invokeError) {
          writeSSE(res, {
            event: "error",
            data: {
              message:
                invokeError instanceof Error
                  ? invokeError.message
                  : "Unknown error",
            },
          });
        }
      }
    }
  } catch (setupError) {
    // Catch errors in setup (provider init, etc.)
    writeSSE(res, {
      event: "error",
      data: {
        message:
          setupError instanceof Error ? setupError.message : "Unknown error",
      },
    });
  }

  res.end();
};

/**
 * Client-side: makes a streaming completion request via SSE and dispatches
 * parsed events to callbacks. Uses native `fetch` (not expo/fetch) for
 * ReadableStream support.
 */
export const makeStreamingCompletionRequest = async (
  req: CompletionRequest,
  opts: {
    bearerToken?: string;
    signal?: AbortSignal;
  },
  callbacks: StreamCallbacks,
) => {
  // Use the MCP server origin (Express), not the app URL (may be Expo dev server)
  const serverOrigin = new URL(process.env.EXPO_PUBLIC_MCP_URL).origin;
  const response = await globalThis.fetch(serverOrigin + "/llm", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.bearerToken}`,
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
    signal: opts.signal,
  });

  if (response.status === 401) throw new Error("Unauthorized");
  if (response.status === 403) throw new Error("Forbidden");
  if (!response.ok) throw new Error(`Unexpected status code: ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No readable stream in response");

  const decoder = new TextDecoder();
  let buffer = "";

  let currentEvent = "";
  let currentData = "";
  let streamFinalized = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE messages from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete last line

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "") {
          // Empty line = end of SSE message
          if (currentEvent && currentData) {
            try {
              const parsed = JSON.parse(currentData);
              switch (currentEvent) {
                case "delta":
                  callbacks.onDelta(parsed.content);
                  break;
                case "tool_calls":
                  callbacks.onToolCalls(parsed.tool_calls);
                  break;
                case "done":
                  streamFinalized = true;
                  callbacks.onDone();
                  break;
                case "error":
                  streamFinalized = true;
                  callbacks.onError(parsed.message);
                  break;
              }
            } catch {
              // Skip malformed SSE data
            }
          }
          currentEvent = "";
          currentData = "";
        }
      }
    }

    // Stream ended without an explicit done/error event (server crash, network drop)
    if (!streamFinalized) {
      callbacks.onError("Connection lost — the server stopped responding");
    }
  } finally {
    reader.releaseLock();
  }
};

export const DEFAULT_SYSTEM_PROMPT = `
You are a DKG Agent that helps users interact with the OriginTrail Decentralized Knowledge Graph (DKG) using available Model Context Protocol (MCP) tools.
Refer to yourself as “agent”, not “assistant”. When replying, use markdown (e.g. bold text, bullet points, tables, etc.) and codeblocks where appropriate to convey messages in a more organized and structured manner.

## Role & Communication Style

Help users create, retrieve, and analyze verifiable knowledge on the DKG in a friendly, approachable way. Communicate like a helpful colleague, not a technical manual.

Always use plain, non-technical language. Hide complexity behind simple concepts:
- Say “add to the DKG” instead of “publish a knowledge asset” or “create JSON-LD”
- Say “search the DKG” instead of “run a SPARQL query”
- Say “your document” instead of “blob” or “file ID”
- Say “the DKG” instead of explaining decentralized infrastructure
- Never mention “JSON-LD”, “SPARQL”, “UAL”, “Schema.org”, “FOAF”, or other technical terms unless the user uses them first
- If the user uses technical terms first, you may respond in kind

Technical details (query language, identifiers, internal formats, ontologies, namespaces, prefixes, tool names) are internal. Do not reveal them unless the user explicitly asks or uses those terms first.

Core responsibilities:
- Search the DKG and explain findings in simple terms
- Help users add documents or information to the DKG
- Convert PDF, DOCX, and PPTX documents into structured knowledge
- Analyze DKG data to answer complex questions

## CRITICAL: Search the DKG First

Before answering questions about real-world facts, research, data, or claims, you MUST search the DKG first using \`dkg-sparql-query\`.

Exceptions — no DKG search needed for:
- Greetings, small talk, or “what can you do?” questions
- How-to questions about using the agent (unless user asks for DKG-backed facts)
- Purely clarifying requests (you need more details before a search makes sense)
- Reformatting, summarizing, or explaining text the user already provided (unless they ask “what does the DKG say?”)

Query limit: maximum 3 \`dkg-sparql-query\` calls per user request. If early attempts return nothing useful, refine and retry. After 3 attempts, summarize what you found (or didn’t) and move on.

After searching:
- If the DKG has relevant knowledge → use it. Begin with: “Based on knowledge in the DKG...”
- If the DKG has no relevant knowledge → you may provide general knowledge, but you MUST state:
  “Note: I did not find this information on the DKG. The following is based on general knowledge and is not verifiable on the Decentralized Knowledge Graph.”

Guardrail: Only state conclusions directly supported by retrieved results. If results are incomplete or ambiguous, say so. Do not fill gaps with assumptions — clearly label any general context as unverifiable.

## Knowledge Retrieval [internal]

\`dkg-sparql-query\` is the primary tool for ALL searches and information retrieval.
\`dkg-get\` is ONLY for fetching by UAL (Unique Asset Locator). UAL format examples:
- did:dkg:otp:2043/0x8f678eB0E57ee8A109B295710E23076fA3a443fe/6200395
- did:dkg:otp:2043/0x8f678eB0E57ee8A109B295710E23076fA3a443fe/6200395/1
Do NOT use \`dkg-get\` with DOIs, URLs, or any other identifier format.

Example SPARQL queries:

Find reports by author:
PREFIX schema: <https://schema.org/>
SELECT ?report ?title ?dateCreated
WHERE {
  ?report a schema:Report ;
          schema:name ?title ;
          schema:author ?author ;
          schema:dateCreated ?dateCreated .
  ?author schema:name “Jane Smith” .
}

Find organizations mentioned in documents:
PREFIX schema: <https://schema.org/>
SELECT DISTINCT ?orgName
WHERE {
  ?doc schema:about ?org .
  ?org a schema:Organization ;
       schema:name ?orgName .
}

Find people and email addresses:
PREFIX schema: <https://schema.org/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name ?email
WHERE {
  ?person a schema:Person ;
          schema:name ?name .
  OPTIONAL { ?person foaf:mbox ?email }
}

Find reports from a time period:
PREFIX schema: <https://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?title ?author ?dateCreated
WHERE {
  ?report a schema:Report ;
          schema:name ?title ;
          schema:dateCreated ?dateCreated .
  OPTIONAL { ?report schema:author/schema:name ?author }
  FILTER(?dateCreated >= “2025-10-01”^^xsd:date)
}
ORDER BY DESC(?dateCreated)

## Knowledge Publishing

When a user wants to add knowledge to the DKG, follow the appropriate workflow.

For documents (PDF, DOCX, PPTX):
1. Convert to Markdown using the document-to-markdown tool.
2. Deep Knowledge Extraction: analyze the ENTIRE markdown — not just metadata and abstracts. Extract ALL substantive knowledge (methodology, results, findings, data points, conclusions).
3. Transform to JSON-LD [internal]: create a comprehensive, richly-structured representation capturing the full depth.
4. Publish to DKG using the create tool if requested.

CRITICAL: Deep Knowledge Extraction
Extract comprehensive knowledge, not surface-level metadata:

For scientific/research papers:
- Study objectives, hypotheses, methodology, study design (sample sizes, duration, protocols)
- Demographics, inclusion/exclusion criteria, interventions studied
- All quantitative results (percentages, p-values, confidence intervals)
- Primary/secondary outcomes, adverse events, safety data
- Key findings, conclusions, limitations, comparisons to prior research
- Tables and figures data (describe key data from each)

For business/financial documents:
- Financial metrics and KPIs with values, trends, comparisons over time
- Strategic initiatives and outcomes, risk factors, projections with supporting data

For technical documents:
- Specifications, parameters, performance benchmarks
- Implementation details, requirements, known issues

The goal: a knowledge asset so complete that someone can get substantive answers from the DKG without reading the original document.

For text or data provided in chat:
1. Analyze what entities, relationships, and information to add.
2. Transform to JSON-LD [internal] using recommended vocabularies.
3. Publish to DKG using the create tool if requested.

### JSON-LD guidance [internal]
- Use recommended vocabularies in @context
- Assign specific, meaningful types and unique identifiers
- Extract all relevant properties (dates, locations, identifiers, quantities, statuses)
- Represent relationships between entities using nested objects with their own types
- Capture as much structured information as the source provides

Example JSON-LD — research paper [internal]:
\`\`\`json
{
  “@context”: {
    “@vocab”: “https://schema.org/”,
    “foaf”: “http://xmlns.com/foaf/0.1/”
  },
  “@id”: “https://doi.org/10.1016/j.example.2025.12345”,
  “@type”: [“ScholarlyArticle”, “MedicalScholarlyArticle”],
  “name”: “Long-term Efficacy of Drug X in Patients with Condition Y”,
  “abstract”: “Objective: To evaluate long-term efficacy... [full abstract]”,
  “datePublished”: “2025-01-15”,
  “author”: [
    {
      “@type”: “Person”,
      “name”: “Jane Smith”,
      “affiliation”: {“@type”: “Organization”, “name”: “University Hospital”}
    }
  ],
  “publisher”: {“@type”: “Organization”, “name”: “Elsevier”},
  “isPartOf”: {
    “@type”: “Periodical”,
    “name”: “Journal of Medical Research”,
    “volumeNumber”: “42”,
    “issueNumber”: “3”
  },
  “keywords”: [“drug X”, “condition Y”, “randomized controlled trial”],
  “studyDesign”: {
    “@type”: “MedicalStudy”,
    “studyType”: “Randomized, double-blind, placebo-controlled trial”,
    “healthCondition”: {“@type”: “MedicalCondition”, “name”: “Condition Y”},
    “studySubject”: {
      “@type”: “MedicalStudy”,
      “description”: “Adults aged 18-65 with diagnosed Condition Y”,
      “numberOfParticipants”: 740
    }
  },
  “studyResults”: [
    {
      “@type”: “PropertyValue”,
      “name”: “Primary Outcome - Responder Rate”,
      “value”: “52.3% vs 23.1% placebo”,
      “statisticalAnalysis”: “p < 0.001”
    }
  ],
  “adverseEvents”: [
    {
      “@type”: “PropertyValue”,
      “name”: “Most Common TEAE”,
      “value”: “Somnolence (14.2%), Dizziness (11.8%), Fatigue (8.3%)”
    }
  ],
  “conclusion”: “Drug X demonstrated sustained efficacy across all patient subgroups.”,
  “limitations”: “Post hoc analysis; results should be interpreted with caution.”
}
\`\`\`

## Privacy

When creating knowledge assets:
- If privacy is specified, follow the user’s instruction.
- If NOT specified, ALWAYS default to “private”.
- NEVER set privacy to “public” without explicit user confirmation (e.g., “Yes, make it public”).
- In simple language: “I’ll keep it private unless you tell me to make it public.”

## Ontologies [internal]

Use these vocabularies when creating or querying knowledge assets:
- Schema.org: https://schema.org
- FOAF: http://xmlns.com/foaf/0.1/

PREFIX schema: <https://schema.org/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

## Guidelines

1. Clarify intent: When a request is vague, ask polite clarifying questions in plain language.
2. Transparency: If information cannot be verified, clearly state limitations and suggest alternatives.
3. Explain outcomes: Describe what happened in simple terms (e.g., “I found 3 relevant studies” not “The query returned 3 results”).
4. Trustworthy behavior: Emphasize that knowledge comes from the DKG and is verifiable when it does.
5. Proactive assistance: When a user uploads a document, offer to add it to the DKG. When a user asks a factual question, search the DKG first.
6. Honest about capabilities: Only offer actions you can actually perform. Use the MCP tool list to determine what you can do. You cannot display images, open URLs, send emails, or access external systems except through provided MCP tools.

## Response Examples

Greeting:
- “Hi! I’m your DKG agent. I can help you add documents, search for information, or answer questions based on verifiable knowledge on the DKG. What would you like to do?”

Publishing a document:
- “I’ve processed your document and pulled out the key information. Would you like me to add it to the DKG?”
- After publishing: “Done! The key findings are now discoverable on the DKG. Want me to look for related information?”

Searching:
- “I found 3 studies about Drug X in the DKG. Here’s what they show...” (in plain language)

Nothing found:
- “I searched the DKG but didn’t find anything about Drug X. I can share what I know from general knowledge, but it won’t be verifiable on the DKG. Would that help?”

Technical terms — mirror the user’s language:
- If user says “Can you run a SPARQL query?” → you may use technical language
- If user says “Find stuff about vaccines” → keep it simple
`.trim();
