import { View, ViewProps } from "react-native";

import IconUser from "./Message/IconUser";
import IconAssistant from "./Message/IconAssistant";
import ChatMessageContent from "./Message/Content";
import ChatMessageToolCall from "./Message/ToolCall";
import ChatMessageActions from "./Message/Actions";
import ChatMessageSourceKAs from "./Message/SourceKAs";

export default function ChatMessage({
  icon,
  ...props
}: ViewProps & {
  icon: "user" | "assistant";
}) {
  return (
    <View
      style={{ gap: 16, flexDirection: "row", width: "100%", marginBottom: 28 }}
    >
      <View style={{ width: 32 }}>
        {icon === "user" && <IconUser />}
        {icon === "assistant" && <IconAssistant />}
      </View>
      <View {...props} style={[{ flex: 1 }, props.style]} />
    </View>
  );
}

ChatMessage.Icon = {
  User: IconUser,
  Assistant: IconAssistant,
};
ChatMessage.Content = ChatMessageContent;
ChatMessage.ToolCall = ChatMessageToolCall;
ChatMessage.Actions = ChatMessageActions;
ChatMessage.SourceKAs = ChatMessageSourceKAs;
