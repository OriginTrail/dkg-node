import useColors from "@/hooks/useColors";
import usePlatform from "@/hooks/usePlatform";
import { useChatStore } from "@/stores";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Container from "../layout/Container";
import ChatContainer from "./ChatContainer";
import ChatInputRowWrapper from "./InputRow";

export default function ChatWrapper() {
  // HOOKS - Libraries
  const safeAreaInsets = useSafeAreaInsets();

  // HOOKS - Custom
  const { isNativeMobile, isWeb, width } = usePlatform();
  const colors = useColors();

  // ZUSTAND Stores
  const hasMessages = useChatStore((state) => state.messages.length > 0);

  const isLandingScreen = !hasMessages && !isNativeMobile;

  console.log("COMPONENT ChatWrapper rendered", hasMessages, isLandingScreen);

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={20}
        style={[
          { flex: 1, position: "relative" },
          isLandingScreen
            ? { justifyContent: "flex-start" }
            : { justifyContent: "flex-end" },
        ]}
      >
        <Container
          style={[
            { paddingBottom: 0 },
            isLandingScreen && { flex: null as any },
          ]}
        >
          <ChatContainer />
        </Container>

        <View
          style={[
            { width: "100%" },
            isLandingScreen && { marginTop: 60 },
            isNativeMobile && {
              backgroundColor: colors.backgroundFlat,
              paddingBottom: safeAreaInsets.bottom,
              height: 2 * 56 + safeAreaInsets.bottom + 20,
            },
          ]}
        >
          <Container
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChatInputRowWrapper />
          </Container>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
