import { useCallback, useRef, useState } from "react";
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
import { useAlerts } from "@/components/Alerts";

import {
  type ChatMessage,
  type ToolCall,
  type ToolCallResultContent,
  makeCompletionRequest,
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

  const pendingToolCalls = useRef<Set<string>>(new Set()); // Track tool calls that need responses before calling LLM
  const toolKAContents = useRef<Map<string, any[]>>(new Map()); // Track KAs across tool calls in a single request

  const chatMessagesRef = useRef<ScrollView>(null);

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

      setMessages((prevMessages) => [...prevMessages, completion]);

      if (completion.tool_calls && completion.tool_calls.length > 0) {
        completion.tool_calls.forEach((tc: any) => {
          pendingToolCalls.current.add(tc.id);
        });
      }
    } finally {
      setIsGenerating(false);
      setTimeout(() => chatMessagesRef.current?.scrollToEnd(), 100);
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

      setMessages((prevMessages) => [...prevMessages, completion]);

      if (completion.tool_calls && completion.tool_calls.length > 0) {
        completion.tool_calls.forEach((tc: any) => {
          pendingToolCalls.current.add(tc.id);
        });
      }
    } finally {
      setIsGenerating(false);
      setTimeout(() => chatMessagesRef.current?.scrollToEnd(), 100);
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

                const isLastMessage = i === messages.length - 1;
                const isIdle = !isGenerating && !m.tool_calls?.length;

                return (
                  <Chat.Message
                    key={i}
                    icon={m.role as "user" | "assistant"}
                    style={{ gap: 8 }}
                  >
                    {/* Source Knowledge Assets */}
                    <Chat.Message.SourceKAs kas={kas} resolver={kaResolver} />

                    {/* Images */}
                    {images.map((image, i) => (
                      <Chat.Message.Content.Image
                        key={i}
                        url={image.uri}
                        authToken={mcp.token}
                      />
                    ))}

                    {/* Files */}
                    {files.map((file, i) => (
                      <Chat.Message.Content.File key={i} file={file} />
                    ))}

                    {/* Text (markdown) */}
                    {text.map((c, i) => (
                      <Chat.Message.Content.Text
                        key={i}
                        text={c.replaceAll(/<think>.*?<\/think>/gs, "")}
                      />
                    ))}

                    {/* Tool calls */}
                    {m.tool_calls?.map((_tc, i) => {
                      const tcId = _tc.id || i.toString();
                      const tc = {
                        ..._tc,
                        id: tcId,
                        info: tools.getCallInfo(tcId),
                      };
                      const toolInfo = mcp.getToolInfo(tc.name);

                      const title = toolInfo
                        ? `${toolInfo.name} - ${mcp.name} (MCP Server)`
                        : tc.name;
                      const description = toolInfo?.description;
                      const autoconfirm =
                        (settings.autoApproveMcpTools ||
                          tools.isAllowedForSession(tc.name)) &&
                        !tc.info;

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
                        }}
                      />
                    )}
                  </Chat.Message>
                );
              })}
              {isGenerating && <Chat.Thinking />}
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
