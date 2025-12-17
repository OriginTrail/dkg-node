import Button from "@/components/Button";
import ArrowUpIcon from "@/components/icons/ArrowUpIcon";
import MicrophoneIcon from "@/components/icons/MicrophoneIcon";
import { useChatStore } from "@/stores/chatStore";
import { StyleSheet, View } from "react-native";

export default function SendButton() {
  const { isGenerating, message } = useChatStore();

  return (
    <View style={styles.inputButtons}>
      <Button
        color="secondary"
        flat
        icon={MicrophoneIcon}
        iconMode="fill"
        style={styles.inputButton}
        // disabled={disabled}
      />
      <Button
        color="primary"
        icon={ArrowUpIcon}
        style={styles.inputButton}
        disabled={message === null || !message.trim() || isGenerating}
        // onPress={onSubmit}
        testID="chat-send-button"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  inputButtons: {
    position: "absolute",
    right: 0,
    padding: 4,
    gap: 4,
    flexDirection: "row",
    height: "100%",
  },
  inputButton: {
    height: "100%",
    aspectRatio: 1,
  },
});
