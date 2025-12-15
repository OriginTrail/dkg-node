import ChatWrapper from "@/components/Chat_Zustand";
import Page from "@/components/layout/Page";

export default function ChatZustandPage() {
  return (
    <Page style={{ flex: 1, position: "relative", marginBottom: 0 }}>
      <ChatWrapper />
    </Page>
  );
}
