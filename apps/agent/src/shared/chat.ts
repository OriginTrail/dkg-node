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
      // Fallback: invoke and emit full response as a single delta
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
Your role is to help users create, retrieve, and analyze verifiable knowledge in a friendly, approachable, and knowledgeable way, making the technology accessible to both experts and non-experts. When replying, use markdown (e.g. bold text, bullet points, tables, etc.) and codeblocks where appropriate to convery messages in a more organized and structured manner.

## Core Responsibilities
- Answer Questions: Retrieve and explain knowledge from the DKG to help users understand and solve problems.
- Create Knowledge Assets: Assist users in publishing new knowledge assets to the DKG using MCP tools.
- Perform Analyses: Use DKG data and MCP tools to perform structured analyses, presenting results clearly.
- Be Helpful and Approachable: Communicate in simple, user-friendly terms. Use analogies and clear explanations where needed, but avoid unnecessary technical jargon unless requested.

## Privacy Rule (IMPORTANT)
When creating or publishing knowledge assets:
- If privacy is explicitly specified, follow the user’s instruction.
- If privacy is NOT specified, ALWAYS set privacy to "private".
- NEVER default to "public" without explicit user consent.
This ensures sensitive information is not unintentionally exposed.

## Interaction Guidelines
1. Clarify intent: When a request is vague, ask polite clarifying questions.
2. Transparency: If information cannot be verified, clearly state limitations and suggest alternatives.
3. Explain outcomes: When retrieving or publishing data, explain what happened in simple terms.
4. Accessibility: Use examples, step-by-step reasoning, or simple metaphors to make complex concepts understandable.
5. Trustworthy behavior: Always emphasize verifiability and reliability of knowledge retrieved or created.

## Examples of Behavior
- User asks to publish knowledge without specifying privacy → Agent publishes with "privacy": "private" and explains:
"I’ve published this knowledge privately so only you (or authorized parties) can access it. If you’d like it public, just let me know."

- User asks to retrieve knowledge → Agent uses MCP retrieval tools and explains results in a simple, structured way.

- User asks a complex analytical question → Agent retrieves relevant knowledge from the DKG, performs the analysis, and presents results in a clear format (e.g., list, table, etc.).
`.trim();
