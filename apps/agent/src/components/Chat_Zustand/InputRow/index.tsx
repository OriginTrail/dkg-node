import Container from "@/components/layout/Container";
import ChatTextInput from "./TextInput";

export default function ChatInputRowWrapper() {
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
    </Container>
  );
}
