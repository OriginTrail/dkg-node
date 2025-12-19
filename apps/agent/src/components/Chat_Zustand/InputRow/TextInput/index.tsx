import { sendUserMessge } from "@/actions/chat";
import useColors from "@/hooks/useColors";
import { useChatStore } from "@/stores/chatStore";
import { TextInput, View } from "react-native";
import SendButton from "./SendButton";

export default function ChatTextInput() {
  const colors = useColors();
  const { message, setMessage } = useChatStore();
  console.log("COMPONENT - ChatTextInput rendered", message);

  return (
    <View
      style={{
        position: "relative",
        height: 56,
        width: "100%",
        maxWidth: 800,
      }}
    >
      <TextInput
        style={{
          backgroundColor: colors.input,
          color: colors.text,

          borderRadius: 50,
          paddingHorizontal: 20,
          paddingVertical: 16,
          height: 56,
          fontSize: 16,
          lineHeight: 24,
        }}
        placeholder="Ask anything..."
        placeholderTextColor={colors.placeholder}
        onChangeText={setMessage}
        value={message ?? ""}
        multiline={false}
        testID="chat-text-input"
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === "Enter") {
            sendUserMessge();
          }
        }}
      />

      <SendButton />
    </View>
  );
}
