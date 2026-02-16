import { useCallback, useEffect, useRef, useState } from "react";
import { View, Platform, KeyboardAvoidingView, ScrollView } from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { fetch } from "expo/fetch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
//import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  parseSourceKAContent,
  SourceKA,
} from "@dkg/plugin-dkg-essentials/utils";

import { useMcpClient } from "@/client";
import useMcpToolsSession from "@/hooks/useMcpToolsSession";
import useColors from "@/hooks/useColors";
import usePlatform from "@/hooks/usePlatform";
import Page from "@/components/layout/Page";
import Container from "@/components/layout/Container";
import Header from "@/components/layout/Header";
import Chat from "@/components/Chat";
import { SourceKAResolver } from "@/components/Chat/Message/SourceKAs/CollapsibleItem";
import Markdown from "@/components/Markdown";
import { useAlerts } from "@/components/Alerts";

import {
  type ChatMessage,
  type ToolCall,
  type ToolCallResultContent,
  makeCompletionRequest,
  makeStreamingCompletionRequest,
  toContents,
} from "@/shared/chat";
import {
  FileDefinition,
  parseFilesFromContent,
  serializeFiles,
  uploadFiles,
} from "@/shared/files";
import { toError } from "@/shared/errors";
import useSettings from "@/hooks/useSettings";
import {
  type ToolExecutionMode,
  toToolExecutionMode,
  toToolExecutionSettings,
} from "@/shared/toolExecutionMode";

function normalizeStreamingMarkdown(content: string): string {
  const fencePattern = /^(`{3,})[^`]*$/gm;
  let count = 0;
  let lastFenceLength = 3;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(content)) !== null) {
    lastFenceLength = match[1]!.length;
    count++;
  }
  if (count % 2 === 1) {
    return content + "\n" + "`".repeat(lastFenceLength);
  }
  return content;
}

const SCROLL_TOP_GAP = 28; // px from viewport top to user message after scroll (matches contentContainerStyle.paddingTop)

function stripThinkTags(content: string): string {
  let result = content.replaceAll(/<think>.*?<\/think>/gs, "");
  result = result.replace(/<think>(?:(?!<\/think>).)*$/s, "");
  return result;
}

export default function ChatPage() {
  const colors = useColors();
  const { isNativeMobile, isWeb, width } = usePlatform();
  const safeAreaInsets = useSafeAreaInsets();
  const { showAlert } = useAlerts();

  const settings = useSettings();
  const mcp = useMcpClient();
  const tools = useMcpToolsSession(mcp.tools);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [messagesViewHeight, setMessagesViewHeight] = useState(0);

  const pendingToolCalls = useRef<Set<string>>(new Set()); // Track tool calls that need responses before calling LLM
  const toolKAContents = useRef<Map<string, any[]>>(new Map()); // Track KAs across tool calls in a single request
  const dispatchedHiddenCalls = useRef<Set<string>>(new Set()); // Track auto-dispatched hidden tool calls
  const reportedHiddenToolCallErrors = useRef<Set<string>>(new Set()); // Avoid duplicate hidden-mode normalization errors
  const localToolCallIdCounter = useRef(0); // Local fallback IDs for tool calls missing an id

  const chatMessagesRef = useRef<ScrollView>(null);
  const lastUserMessageYRef = useRef(0);
  const scrollPendingRef = useRef(false);
  const scrollTargetRef = useRef<number | null>(null);
  const messagesViewHeightRef = useRef(0);

  const [contentMinHeight, setContentMinHeight] = useState(0);
  const settingsToolExecutionMode = toToolExecutionMode(settings);
  const [toolExecutionMode, setToolExecutionMode] = useState<ToolExecutionMode>(
    settingsToolExecutionMode,
  );
  const autoApproveTools = toolExecutionMode !== "ask";
  const showToolExecutionPanels = toolExecutionMode === "auto_show";

  useEffect(() => {
    setToolExecutionMode(settingsToolExecutionMode);
  }, [settingsToolExecutionMode]);

  const handleToolExecutionModeChange = useCallback(
    async (mode: ToolExecutionMode) => {
      // Apply immediately in-memory to avoid stale-mode auto-runs
      setToolExecutionMode(mode);
      if (mode === "ask") tools.clearAllowedForSession();

      const s = toToolExecutionSettings(mode);
      await settings.set("autoApproveMcpTools", s.autoApproveMcpTools);
      await settings.set("showMcpToolExecutionPanels", s.showMcpToolExecutionPanels);
      await settings.reload();
    },
    [settings, tools],
  );

  async function callTool(tc: ToolCall & { id: string }) {
    tools.saveCallInfo(tc.id, { input: tc.args, status: "loading" });

    return mcp
      .callTool({ name: tc.name, arguments: tc.args }, undefined, {
        timeout: 300000,
        maxTotalTimeout: 300000,
      })
      .then((result) => {
        tools.saveCallInfo(tc.id, {
          input: tc.args,
          status: "success",
          output: result.content,
        });

        addToolResultAndCheckCompletion({
          role: "tool",
          tool_call_id: tc.id,
          content: result.content as ToolCallResultContent,
        });
      })
      .catch((err) => {
        tools.saveCallInfo(tc.id, {
          input: tc.args,
          status: "error",
          error: err.message,
        });

        addToolResultAndCheckCompletion({
          role: "tool",
          tool_call_id: tc.id,
          content: "Error occurred while calling tool: " + err.message,
          isError: true,
        });
      });
  }

  function normalizeCompletionToolCalls(completion: ChatMessage) {
    const toolCalls = completion.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return {
        completion,
        normalizedToolCalls: [] as (ToolCall & { id: string })[],
        droppedToolCalls: 0,
      };
    }

    const normalizedToolCalls: (ToolCall & { id: string })[] = [];
    let droppedToolCalls = 0;

    for (const tc of toolCalls) {
      if (!tc?.name) {
        droppedToolCalls += 1;
        continue;
      }

      const existingId =
        typeof tc.id === "string" ? tc.id.trim() : "";
      normalizedToolCalls.push({
        ...tc,
        id: existingId || `local-tool-call-${localToolCallIdCounter.current++}`,
      });
    }

    return {
      completion: {
        ...completion,
        tool_calls: normalizedToolCalls,
      } as ChatMessage,
      normalizedToolCalls,
      droppedToolCalls,
    };
  }

  function addAssistantCompletion(completion: ChatMessage) {
    const {
      completion: normalizedCompletion,
      normalizedToolCalls,
      droppedToolCalls,
    } = normalizeCompletionToolCalls(completion);

    setMessages((prevMessages) => {
      const nextMessages = [...prevMessages, normalizedCompletion];
      if (droppedToolCalls > 0) {
        nextMessages.push({
          role: "assistant",
          content:
            droppedToolCalls === 1
              ? "Error: Received an invalid tool call and skipped it."
              : `Error: Received ${droppedToolCalls} invalid tool calls and skipped them.`,
        });
      }
      return nextMessages;
    });

    normalizedToolCalls.forEach((tc) => {
      pendingToolCalls.current.add(tc.id);
    });
  }

  // Auto-execute tool calls when panels are hidden (mode: auto_silent).
  // Deps intentionally exclude tools/callTool — dispatchedHiddenCalls ref prevents double-dispatch.
  useEffect(() => {
    for (const [messageIndex, m] of messages.entries()) {
      if (m.role !== "assistant" || !m.tool_calls) continue;
      for (const [toolIndex, tc] of m.tool_calls.entries()) {
        const tcId = tc.id || "";
        if (!tcId) {
          const errorKey = `${messageIndex}:${toolIndex}`;
          if (!reportedHiddenToolCallErrors.current.has(errorKey)) {
            reportedHiddenToolCallErrors.current.add(errorKey);
            setMessages((prevMessages) => [
              ...prevMessages,
              {
                role: "assistant",
                content:
                  "Error: Could not execute a tool call because it did not include a valid id.",
              },
            ]);
          }
          continue;
        }
        if (dispatchedHiddenCalls.current.has(tcId)) continue;
        if (tools.getCallInfo(tcId)) continue;

        const isAutoApproved =
          autoApproveTools || tools.isAllowedForSession(tc.name);
        if (!isAutoApproved || showToolExecutionPanels) continue;

        dispatchedHiddenCalls.current.add(tcId);
        callTool({ ...tc, id: tcId });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, autoApproveTools, showToolExecutionPanels]);

  function addToolResultAndCheckCompletion(toolResult: ChatMessage) {
    const kaContents: any[] = [];
    const otherContents: any[] = [];

    for (const c of toContents(toolResult.content) as ToolCallResultContent) {
      const kas = parseSourceKAContent(c);
      if (kas) kaContents.push(c);
      else otherContents.push(c);
    }
    toolResult.content = otherContents;

    const toolCallId = (toolResult as any).tool_call_id;
    if (kaContents.length > 0) {
      toolKAContents.current.set(toolCallId, kaContents);
    }

    setMessages((prevMessages) => [...prevMessages, toolResult]);
    pendingToolCalls.current.delete(toolCallId);

    if (pendingToolCalls.current.size === 0) {
      requestCompletion(); // If all tool calls are complete, only then hit the LLM
    }
  }

  async function requestCompletion() {
    if (isWeb) return requestCompletionStreaming();

    if (!mcp.token) throw new Error("Unauthorized");

    setIsGenerating(true);
    try {
      let currentMessages: ChatMessage[] = [];
      await new Promise<void>((resolve) => {
        setMessages((prevMessages) => {
          currentMessages = prevMessages;
          resolve();
          return prevMessages;
        });
      });

      const completion = await makeCompletionRequest(
        {
          messages: currentMessages,
          tools: tools.enabled,
        },
        {
          fetch: (url, opts) => fetch(url.toString(), opts as any) as any,
          bearerToken: mcp.token,
        },
      );

      const allKAContents: any[] = [];
      toolKAContents.current.forEach((kaContents) => {
        allKAContents.push(...kaContents);
      });

      if (allKAContents.length > 0) {
        completion.content = toContents(completion.content);
        completion.content.push(...allKAContents);
      }

      toolKAContents.current.clear();

      addAssistantCompletion(completion);
    } finally {
      setIsGenerating(false);
    }
  }

  async function streamCompletion(messagesToSend: ChatMessage[]) {
    let accumulatedContent = "";
    let receivedToolCalls: ToolCall[] | null = null;
    let rafId: number | null = null;

    try {
      await makeStreamingCompletionRequest(
        { messages: messagesToSend, tools: tools.enabled },
        { bearerToken: mcp.token! },
        {
          onDelta(content) {
            accumulatedContent += content;
            if (rafId === null) {
              rafId = requestAnimationFrame(() => {
                setStreamingContent(accumulatedContent);
                rafId = null;
              });
            }
          },
          onToolCalls(toolCalls) {
            receivedToolCalls = toolCalls;
          },
          onDone() {
            if (rafId !== null) cancelAnimationFrame(rafId);
            setStreamingContent(null);

            const allKAContents: any[] = [];
            toolKAContents.current.forEach((kaContents) => {
              allKAContents.push(...kaContents);
            });
            toolKAContents.current.clear();

            const completion: ChatMessage = {
              role: "assistant",
              content: accumulatedContent,
              tool_calls: receivedToolCalls ?? undefined,
            };

            if (allKAContents.length > 0) {
              completion.content = toContents(completion.content);
              completion.content.push(...allKAContents);
            }

            setMessages((prev) => [...prev, completion]);

            if (receivedToolCalls && receivedToolCalls.length > 0) {
              receivedToolCalls.forEach((tc: any) => {
                pendingToolCalls.current.add(tc.id);
              });
            }
          },
          onError(message) {
            if (rafId !== null) cancelAnimationFrame(rafId);
            setStreamingContent(null);
            showAlert({
              type: "error",
              title: "LLM Error",
              message,
              timeout: 5000,
            });
          },
        },
      );
    } finally {
      // Cancel any pending RAF to prevent stale UI updates after errors
      if (rafId !== null) cancelAnimationFrame(rafId);
    }
  }

  async function requestCompletionStreaming() {
    if (!mcp.token) throw new Error("Unauthorized");

    setIsGenerating(true);
    try {
      let currentMessages: ChatMessage[] = [];
      await new Promise<void>((resolve) => {
        setMessages((prevMessages) => {
          currentMessages = prevMessages;
          resolve();
          return prevMessages;
        });
      });

      await streamCompletion(currentMessages);
    } catch (error) {
      setStreamingContent(null);
      showAlert({
        type: "error",
        title: "LLM Error",
        message: error instanceof Error ? error.message : String(error),
        timeout: 5000,
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function sendMessageStreaming(newMessage: ChatMessage) {
    scrollPendingRef.current = true;
    setMessages((prevMessages) => [...prevMessages, newMessage]);

    if (!mcp.token) throw new Error("Unauthorized");

    setIsGenerating(true);
    try {
      await streamCompletion([...messages, newMessage]);
    } catch (error) {
      setStreamingContent(null);
      showAlert({
        type: "error",
        title: "LLM Error",
        message: error instanceof Error ? error.message : String(error),
        timeout: 5000,
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function cancelToolCall(tc: ToolCall & { id: string }) {
    tools.saveCallInfo(tc.id, { input: tc.args, status: "cancelled" });

    addToolResultAndCheckCompletion({
      role: "tool",
      tool_call_id: tc.id,
      content: "Tool call was cancelled by user",
    });
  }

  async function sendMessage(newMessage: ChatMessage) {
    if (isWeb) return sendMessageStreaming(newMessage);

    scrollPendingRef.current = true;
    setMessages((prevMessages) => [...prevMessages, newMessage]);

    if (!mcp.token) throw new Error("Unauthorized");

    setIsGenerating(true);
    try {
      const completion = await makeCompletionRequest(
        {
          messages: [...messages, newMessage],
          tools: tools.enabled,
        },
        {
          fetch: (url, opts) => fetch(url.toString(), opts as any) as any,
          bearerToken: mcp.token,
        },
      );

      addAssistantCompletion(completion);
    } finally {
      setIsGenerating(false);
    }
  }

  const kaResolver = useCallback<SourceKAResolver>(
    async (ual) => {
      try {
        const resource = await mcp.readResource({ uri: ual });
        const content = resource.contents[0]?.text as string;
        if (!content) throw new Error("Resource not found");

        const parsedContent = JSON.parse(content);
        const resolved = {
          assertion: parsedContent.assertion,
          lastUpdated: new Date(
            parsedContent.metadata
              .at(0)
              ?.[
              "https://ontology.origintrail.io/dkg/1.0#publishTime"
            ]?.at(0)?.["@value"] ?? Date.now(),
          ).getTime(),
          txHash: parsedContent.metadata
            .at(0)
            ?.["https://ontology.origintrail.io/dkg/1.0#publishTx"]?.at(0)?.[
            "@value"
          ],
          publisher: parsedContent.metadata
            .at(0)
            ?.["https://ontology.origintrail.io/dkg/1.0#publishedBy"]?.at(0)
            ?.["@id"]?.split("/")
            .at(1),
        };

        // hotfix, KC metadata not present in KA metadata
        if (!resolved.txHash || !resolved.publisher) {
          const splitUal = ual.split("/");
          splitUal.pop();
          const kcUal = splitUal.join("/");
          const resource = await mcp.readResource({ uri: kcUal });
          const content = resource.contents[0]?.text as string;
          if (!content) {
            resolved.publisher = "unknown";
            resolved.txHash = "unknown";
            return resolved;
          }

          const parsedContent = JSON.parse(content);
          resolved.txHash =
            parsedContent.metadata
              .at(0)
              ?.["https://ontology.origintrail.io/dkg/1.0#publishTx"]?.at(0)?.[
            "@value"
            ] ?? "unknown";
          resolved.publisher =
            parsedContent.metadata
              .at(0)
              ?.["https://ontology.origintrail.io/dkg/1.0#publishedBy"]?.at(0)
              ?.["@id"]?.split("/")
              .at(1) ?? "unknown";
        }

        return resolved;
      } catch (error) {
        showAlert({
          type: "error",
          title: "Failed to resolve Knowledge Asset",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [mcp, showAlert],
  );

  const lastUserMsgIdx = messages.reduce(
    (a, m, i) => (m.role === "user" ? i : a),
    -1,
  );

  const handleContentSizeChange = useCallback((_w: number, h: number) => {
    if (scrollTargetRef.current !== null) {
      const targetY = scrollTargetRef.current;
      // Only scroll once content is tall enough for the scroll position to work
      if (h >= targetY + messagesViewHeightRef.current) {
        scrollTargetRef.current = null;
        chatMessagesRef.current?.scrollTo({ y: targetY, animated: true });
      }
    }
  }, []);

  const isLandingScreen = !messages.length && !isNativeMobile;
  console.debug("Messages:", messages);
  console.debug("Tools (enabled):", tools.enabled);

  return (
    <Page style={{ flex: 1, position: "relative", marginBottom: 0 }}>
      <Chat>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={20}
          style={[
            { flex: 1, position: "relative" },
            isLandingScreen
              ? { justifyContent: "flex-start" }
              : { justifyContent: "flex-end" },
          ]}
        >
          <Container
            style={[
              { paddingBottom: 0 },
              isLandingScreen && { flex: null as any },
            ]}
          >
            <Header handleLogout={() => mcp.disconnect()} />
            <Chat.Messages
              ref={chatMessagesRef}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                setMessagesViewHeight(h);
                messagesViewHeightRef.current = h;
              }}
              onContentSizeChange={handleContentSizeChange}
              contentContainerStyle={{
                paddingTop: 28,
                paddingBottom: 16,
                ...(contentMinHeight > 0 && { minHeight: contentMinHeight }),
              }}
              style={[
                {
                  width: "100%",
                  marginHorizontal: "auto",
                  maxWidth: 800,
                },
                width >= 800 + 48 * 2 + 20 * 2 && {
                  maxWidth: 800 + 48 * 2,
                  paddingRight: 48,
                },
              ]}
            >
              {messages.map((m, i) => {
                if (m.role !== "user" && m.role !== "assistant") return null;

                const kas: SourceKA[] = [];
                const files: FileDefinition[] = [];
                const images: { uri: string }[] = [];
                const text: string[] = [];

                for (const c of toContents(m.content)) {
                  if (c.type === "image_url") {
                    images.push({ uri: c.image_url });
                    continue;
                  }

                  if (c.type === "text") {
                    const k = parseSourceKAContent(c as unknown as any);
                    if (k) {
                      kas.push(...k);
                      continue;
                    }

                    const f = parseFilesFromContent(c);
                    if (f.length) {
                      for (const file of f)
                        if (file.mimeType?.startsWith("image/"))
                          images.push({ uri: file.uri });
                        else files.push(file);
                      continue;
                    }

                    text.push(c.text);
                  }
                }

                // Skip assistant messages that have only hidden tool calls and no visible content
                const hasToolCalls = !!m.tool_calls?.length;
                const allToolCallsHidden =
                  hasToolCalls &&
                  m.tool_calls!.every((tc) => {
                    const isAutoApproved = autoApproveTools || tools.isAllowedForSession(tc.name);
                    return isAutoApproved && !showToolExecutionPanels;
                  });

                const hasVisibleText = text.some((t) => t.trim());

                if (
                  allToolCallsHidden &&
                  !hasVisibleText &&
                  kas.length === 0 &&
                  files.length === 0 &&
                  images.length === 0
                ) {
                  return null;
                }

                const isLastMessage = i === messages.length - 1;
                const isIdle = !isGenerating && !m.tool_calls?.length;

                const messageContent = (
                  <Chat.Message
                    icon={m.role as "user" | "assistant"}
                    style={{ gap: 8 }}
                  >
                    {/* Source Knowledge Assets */}
                    <Chat.Message.SourceKAs kas={kas} resolver={kaResolver} />

                    {/* Images */}
                    {images.map((image, j) => (
                      <Chat.Message.Content.Image
                        key={j}
                        url={image.uri}
                        authToken={mcp.token}
                      />
                    ))}

                    {/* Files */}
                    {files.map((file, j) => (
                      <Chat.Message.Content.File key={j} file={file} />
                    ))}

                    {/* Text (markdown) */}
                    {text.map((c, j) => (
                      <Chat.Message.Content.Text
                        key={j}
                        text={c.replaceAll(/<think>.*?<\/think>/gs, "")}
                      />
                    ))}

                    {/* Tool calls */}
                    {m.tool_calls?.map((_tc, j) => {
                      const tcId = _tc.id || j.toString();
                      const tc = {
                        ..._tc,
                        id: tcId,
                        info: tools.getCallInfo(tcId),
                      };

                      const isAutoApproved =
                        autoApproveTools || tools.isAllowedForSession(tc.name);

                      // Hide panel when auto-approved and panels are off
                      if (isAutoApproved && !showToolExecutionPanels) {
                        return null;
                      }

                      const toolInfo = mcp.getToolInfo(tc.name);

                      const title = toolInfo
                        ? `${toolInfo.name} - ${mcp.name} (MCP Server)`
                        : tc.name;
                      const description = toolInfo?.description;
                      const autoconfirm = isAutoApproved && !tc.info;

                      return (
                        <Chat.Message.ToolCall
                          key={tc.id}
                          title={title}
                          description={description}
                          status={tc.info?.status ?? "init"}
                          input={tc.info?.input ?? _tc.args}
                          output={tc.info?.output ?? tc.info?.error}
                          autoconfirm={autoconfirm}
                          onConfirm={(allowForSession) => {
                            callTool(tc);
                            if (allowForSession) tools.allowForSession(tc.name);
                          }}
                          onCancel={() => cancelToolCall(tc)}
                        />
                      );
                    })}

                    {/* Actions at the bottom */}
                    {m.role === "assistant" && isLastMessage && isIdle && (
                      <Chat.Message.Actions
                        style={{ marginVertical: 16 }}
                        onCopyAnswer={() => {
                          Clipboard.setStringAsync(text.join("\n").trim());
                        }}
                        onStartAgain={() => {
                          setMessages([]);
                          tools.reset();
                          pendingToolCalls.current.clear();
                          toolKAContents.current.clear();
                          lastUserMessageYRef.current = 0;
                          scrollPendingRef.current = false;
                          scrollTargetRef.current = null;
                          setContentMinHeight(0);
                          dispatchedHiddenCalls.current.clear();
                          reportedHiddenToolCallErrors.current.clear();
                        }}
                      />
                    )}
                  </Chat.Message>
                );

                if (i === lastUserMsgIdx) {
                  return (
                    <View
                      key={i}
                      onLayout={(e) => {
                        const y = e.nativeEvent.layout.y;
                        lastUserMessageYRef.current = y;
                        if (scrollPendingRef.current) {
                          scrollPendingRef.current = false;
                          scrollTargetRef.current = Math.max(0, y - SCROLL_TOP_GAP);
                          setContentMinHeight(y + messagesViewHeight);
                        }
                      }}
                    >
                      {messageContent}
                    </View>
                  );
                }

                return <View key={i}>{messageContent}</View>;
              })}
              {isGenerating && streamingContent === null && <Chat.Thinking />}
              {streamingContent !== null && (
                <Chat.Message icon="assistant">
                  <Markdown>
                    {normalizeStreamingMarkdown(stripThinkTags(streamingContent))}
                  </Markdown>
                </Chat.Message>
              )}
            </Chat.Messages>
          </Container>

          <View
            style={[
              { width: "100%" },
              isLandingScreen && { marginTop: 60 },
              isNativeMobile && {
                backgroundColor: colors.backgroundFlat,
                paddingBottom: safeAreaInsets.bottom,
                height: 2 * 56 + safeAreaInsets.bottom + 20,
              },
            ]}
          >
            <Container
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isLandingScreen && (
                <Image
                  source={require("@/assets/logo.svg")}
                  style={{ width: 100, height: 100, marginBottom: 24 }}
                  testID="app-logo"
                />
              )}
              <Chat.Input
                onSendMessage={sendMessage}
                onUploadFiles={(assets) =>
                  uploadFiles(
                    new URL(process.env.EXPO_PUBLIC_MCP_URL + "/blob"),
                    assets,
                    {
                      fieldName: "file",
                      uploadType: 1,
                      headers: { Authorization: `Bearer ${mcp.token}` },
                    },
                  ).then(({ successful, failed }) => {
                    if (failed.length) {
                      console.debug("Failed uploads:", failed);
                      showAlert({
                        type: "error",
                        title: "Upload error",
                        message: "Some uploads have failed!",
                        timeout: 5000,
                      });
                    }

                    return successful.map((data) => ({
                      ...data,
                      uri: new URL(
                        process.env.EXPO_PUBLIC_MCP_URL + "/blob/" + data.id,
                      ).toString(),
                    }));
                  })
                }
                onFileRemoved={(f) => {
                  fetch(
                    new URL(
                      process.env.EXPO_PUBLIC_MCP_URL + "/blob/" + f.id,
                    ).toString(),
                    {
                      method: "DELETE",
                      headers: { Authorization: `Bearer ${mcp.token}` },
                    },
                  ).catch((error) => {
                    console.debug("File removal error:", error);
                    showAlert({
                      type: "error",
                      title: "File removal error",
                      message: toError(error).message,
                      timeout: 5000,
                    });
                  });
                }}
                onUploadError={(error) => {
                  console.debug("Upload error:", error);
                  showAlert({
                    type: "error",
                    title: "Upload error",
                    message: error.message,
                    timeout: 5000,
                  });
                }}
                onAttachFiles={serializeFiles}
                authToken={mcp.token}
                tools={{
                  [mcp.name]: mcp.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    enabled: tools.isEnabled(t.name),
                  })),
                }}
                onToolTick={(_, tool, enabled) => {
                  tools.toggle(tool, enabled);
                }}
                onToolServerTick={(_, enabled) => {
                  tools.toggleAll(enabled);
                }}
                toolExecutionMode={toolExecutionMode}
                onToolExecutionModeChange={handleToolExecutionModeChange}
                disabled={isGenerating}
                style={[{ maxWidth: 800 }, isWeb && { pointerEvents: "auto" }]}
              />
            </Container>
          </View>
        </KeyboardAvoidingView>
      </Chat>
    </Page>
  );
}
