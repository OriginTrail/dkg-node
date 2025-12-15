import Page from "@/components/layout/Page";
import useColors from "@/hooks/useColors";
import { StyleSheet, Text, View } from "react-native";

export default function ChatZustandPage() {
  const colors = useColors();

  return (
    <Page style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <View
        style={[
          styles.box,
          {
            backgroundColor: "blue",
            borderColor: "red",
          },
        ]}
      >
        <Text style={[styles.text, { color: "black" }]}>testing zustand</Text>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  box: {
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  text: {
    fontSize: 18,
    fontWeight: "500",
  },
});
