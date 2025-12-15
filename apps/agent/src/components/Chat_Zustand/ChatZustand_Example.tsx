import { ScrollView, StyleSheet, Text, View } from "react-native";

import useColors from "@/hooks/useColors";
import { useChatStore } from "@/stores";
import Button from "../Button";

export default function ChatZustandComponent() {
  const colors = useColors();
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
    <View
      style={[styles.container, { backgroundColor: colors.backgroundFlat }]}
    >
      {/* State Display */}
      <View style={[styles.stateBox, { borderColor: "red" }]}>
        <Text style={[styles.label, { color: "black" }]}>
          isGenerating: {isGenerating ? "true" : "false"}
        </Text>
        <Text style={[styles.label, { color: "black" }]}>
          messages: {messages.length}
        </Text>
      </View>

      {/* Messages List */}
      <ScrollView
        style={[styles.messagesList, { borderColor: "red" }]}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 ? (
          <Text style={[styles.emptyText, { color: "black" }]}>
            No messages yet
          </Text>
        ) : (
          messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.message,
                {
                  backgroundColor:
                    msg.role === "user" ? colors.primary : colors.secondary,
                },
              ]}
            >
              <Text style={styles.messageRole}>{msg.role}</Text>
              <Text style={styles.messageContent}>{msg.content}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Actions */}
      <View style={styles.actions}>
        <Button color="primary" text="Add Message" onPress={handleAddMessage} />
        <Button
          color="secondary"
          text={isGenerating ? "Stop" : "Start Generating"}
          onPress={handleToggleGenerating}
        />
        <Button color="primary" text="Clear" onPress={clearMessages} />
      </View>
    </View>
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
