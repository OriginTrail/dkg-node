import Button from "@/components/Button";
import Container from "@/components/layout/Container";
import { useChatStore } from "@/stores/chatStore";
import { StyleSheet, View } from "react-native";
import ChatTextInput from "./TextInput";

export default function ChatInputRowWrapper() {
  const { messages, isGenerating, addMessage, clearMessages, setIsGenerating } =
    useChatStore();

  const handleAddMessage = () => {
    addMessage({
      id: Date.now().toString(),
      role: messages.length % 2 === 0 ? "user" : "assistant",
      content: `Test message #${messages.length + 1}`,
    });
  };

  const handleToggleGenerating = () => {
    setIsGenerating(!isGenerating);
  };

  return (
    <Container
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ChatTextInput />
      <View style={styles.actions}>
        <Button color="primary" text="Add Message" onPress={handleAddMessage} />
        <Button
          color="secondary"
          text={isGenerating ? "Stop" : "Start Generating"}
          onPress={handleToggleGenerating}
        />
        <Button color="primary" text="Clear" onPress={clearMessages} />
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  stateBox: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontFamily: "monospace",
  },
  messagesList: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
  },
  messagesContent: {
    padding: 12,
    gap: 8,
  },
  emptyText: {
    textAlign: "center",
    fontStyle: "italic",
  },
  message: {
    padding: 10,
    borderRadius: 8,
  },
  messageRole: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
  },
  messageContent: {
    fontSize: 14,
    color: "#fff",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    flexWrap: "wrap",
  },
});
