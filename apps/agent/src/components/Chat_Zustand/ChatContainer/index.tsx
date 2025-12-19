import useColors from "@/hooks/useColors";
import { useChatStore } from "@/stores/chatStore";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function ChatContainer() {
  const colors = useColors();
  const { messages } = useChatStore();

  return (
    <ScrollView
      style={[{ marginHorizontal: 60 }]}
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
