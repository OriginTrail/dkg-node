export enum ChatMessageType_ENUM {
  USER = "user",
  ASSISTANT = "assistant",
}

export interface ChatMessage_I {
  id: string;
  role: ChatMessageType_ENUM;
  content: string;
}
