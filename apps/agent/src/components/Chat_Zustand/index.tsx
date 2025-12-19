import { useMcpClient } from "@/client";
import useColors from "@/hooks/useColors";
import usePlatform from "@/hooks/usePlatform";
import { useChatStore } from "@/stores";
import { Image } from "expo-image";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Container from "../layout/Container";
import Header from "../layout/Header";
import ChatContainer from "./ChatContainer";
import ChatInputRowWrapper from "./InputRow";

export default function ChatWrapper() {
  // HOOKS - Libraries
  const safeAreaInsets = useSafeAreaInsets();

  // HOOKS - Custom
  const { isNativeMobile } = usePlatform();
  const colors = useColors();
  const mcp = useMcpClient();

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
        <Container style={[isLandingScreen && { flex: null as any }]}>
          <Header handleLogout={() => mcp.disconnect()} />

          {!hasMessages ? (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                marginTop: 100,
                marginBottom: 10,
              }}
            >
              <Image
                source={require("@/assets/logo.svg")}
                style={{ width: 100, height: 100 }}
                testID="app-logo"
              />
            </View>
          ) : (
            <ChatContainer />
          )}
        </Container>

        <View
          style={[
            { width: "100%" },
            isNativeMobile && {
              backgroundColor: colors.backgroundFlat,
              paddingBottom: safeAreaInsets.bottom,
              height: 2 * 56 + safeAreaInsets.bottom + 20,
            },
          ]}
        >
          <ChatInputRowWrapper />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
