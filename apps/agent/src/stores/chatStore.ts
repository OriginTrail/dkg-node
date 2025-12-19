import { ChatMessage_I } from "@/models/chat";
import { create } from "zustand";

interface ChatState_I {
  // State
  messages: ChatMessage_I[];
  isGenerating: boolean;
  message: string | null;

  // Actions
  setMessage: (message: string | null) => void;
  addMessage: (message: ChatMessage_I) => void;
  setMessages: (messages: ChatMessage_I[]) => void;
  clearMessages: () => void;
  setIsGenerating: (isGenerating: boolean) => void;
}

export const useChatStore = create<ChatState_I>((set) => ({
  // Initial state
  messages: [],
  isGenerating: false,
  message: null,

  // Actions
  setMessage: (message) => set({ message }), // The text input field when user wants to send a new message
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [] }),

  setIsGenerating: (isGenerating) => set({ isGenerating }),
}));
