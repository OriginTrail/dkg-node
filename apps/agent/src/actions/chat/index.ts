import { ChatMessage_I, ChatMessageType_ENUM } from "@/models/chat";
import type { ChatMessage, CompletionRequest } from "@/shared/chat";
import { useChatStore } from "@/stores/chatStore";

export const makeCompletionRequest = async (
  req: CompletionRequest,
  bearerToken?: string
): Promise<ChatMessage> => {
  const url = new URL(process.env.EXPO_PUBLIC_APP_URL + "/llm");
  const headers: HeadersInit = {
    Authorization: `Bearer ${bearerToken}`,
  };
  const body = JSON.stringify(req);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
  });

  if (response.status === 200) return response.json();
  if (response.status === 401) throw new Error("Unauthorized");
  if (response.status === 403) throw new Error("Forbidden");
  throw new Error(`Unexpected status code: ${response.status}`);
};

export async function sendUserMessge() {
  // Take the text user input and send it.
  const { message, addMessage, setIsGenerating, setMessage } =
    useChatStore.getState();

  if (!message) {
    return;
  }

  const newMessage: ChatMessage_I = {
    id: crypto.randomUUID(),
    role: ChatMessageType_ENUM.USER,
    content: message,
  };
  addMessage(newMessage);
  setMessage(null);
  setIsGenerating(true);

  console.log("Sending user message to LLM:", newMessage);
  // Add a placeholder function that just wait for 2 seconds
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log("User message sent to LLM");

  setIsGenerating(false);
}
