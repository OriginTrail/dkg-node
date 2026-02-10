import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import useColors from "@/hooks/useColors";
import Checkbox from "@/components/Checkbox";
import Button from "@/components/Button";

export default function McpAutoapproveForm({
  currentAutoApprove,
  currentShowPanels,
  onSubmit,
}: {
  currentAutoApprove: boolean;
  currentShowPanels: boolean;
  onSubmit: (autoApprove: boolean, showPanels: boolean) => Promise<void>;
}) {
  const colors = useColors();
  const [autoApprove, setAutoApprove] = useState(currentAutoApprove);
  const [showPanels, setShowPanels] = useState(currentShowPanels);
  const [loading, setLoading] = useState(false);

  const isDirty =
    autoApprove !== currentAutoApprove || showPanels !== currentShowPanels;

  const submit = useCallback(async () => {
    setLoading(true);
    try {
      await onSubmit(autoApprove, showPanels);
    } finally {
      setLoading(false);
    }
  }, [onSubmit, autoApprove, showPanels]);

  return (
    <View style={{ flex: 1 }}>
      <Checkbox value={autoApprove} onValueChange={setAutoApprove}>
        <Text
          style={{
            fontFamily: "Manrope_400Regular",
            color: colors.text,
            fontSize: 16,
            lineHeight: 16,
          }}
        >
          Auto-approve MCP tools
        </Text>
      </Checkbox>
      <Text
        style={{
          fontFamily: "Manrope_400Regular",
          color: colors.placeholder,
          fontSize: 12,
          lineHeight: 18,
          marginBottom: 8,
        }}
      >
        Allow DKG Agent to run MCP tools automatically without requiring user
        confirmation.
      </Text>

      <Checkbox
        value={showPanels}
        onValueChange={setShowPanels}
        disabled={!autoApprove}
        style={{ marginLeft: 24 }}
      >
        <Text
          style={{
            fontFamily: "Manrope_400Regular",
            color: colors.text,
            fontSize: 16,
            lineHeight: 16,
          }}
        >
          Show MCP tool execution panels
        </Text>
      </Checkbox>
      <Text
        style={{
          fontFamily: "Manrope_400Regular",
          color: colors.placeholder,
          fontSize: 12,
          lineHeight: 18,
          marginBottom: 8,
          marginLeft: 24,
          opacity: !autoApprove ? 0.4 : 1,
        }}
      >
        Display tool name, inputs, and outputs in chat when tools run
        automatically.
      </Text>

      <Button
        color="primary"
        text="Update"
        onPress={submit}
        disabled={!isDirty || loading}
      />
    </View>
  );
}
