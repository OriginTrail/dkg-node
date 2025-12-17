import { create } from "zustand";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatState {
  // State
  messages: ChatMessage[];
  isGenerating: boolean;
  message: string | null;

  // Actions
  setMessage: (message: string) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  setIsGenerating: (isGenerating: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
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
