import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View, ViewProps } from "react-native";
import { Collapsible } from "react-native-fast-collapsible";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { SourceKA } from "@dkg/plugin-dkg-essentials/utils";

import useColors from "@/hooks/useColors";
import GraphView from "@/components/GraphView";

import ChatMessageSourceKAsChip from "./Chip";
import ChatMessageSourceKAsProfileCard from "./ProfileCard";

export type SourceKAResolved = {
  lastUpdated: number;
  publisher: string;
  txHash: string;
  assertion: Record<string, any>[];
};

export type SourceKAResolver = (ual: string) => Promise<SourceKAResolved>;

export default function ChatMessageSourceKAsCollapsibleItem({
  collapsed,
  onPress,
  title,
  issuer,
  ual,
  resolver,
  style,
  ...props
}: SourceKA & {
  collapsed?: boolean;
  resolver: SourceKAResolver;
  onPress?: () => void;
} & ViewProps) {
  const originalResolver = resolver;

  const colors = useColors();

  const [resolvedData, setResolvedData] = useState<SourceKAResolved>();
  useEffect(() => {
    if (!collapsed) {
      originalResolver(ual).then(setResolvedData);
    }
  }, [collapsed, ual]);

  return (
    <View
      {...props}
      style={[
        {
          padding: 16,
          backgroundColor: colors.card,
          borderRadius: 16,
        },
        !collapsed && {
          backgroundColor: colors.card + "25",
        },
        style,
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          height: 64,
        }}
      >
        <ChatMessageSourceKAsChip
          title={title}
          issuer={issuer}
          style={{ padding: 0, backgroundColor: "transparent" }}
        />
        <Ionicons
          name={collapsed ? "chevron-down" : "chevron-up"}
          color={colors.secondary}
          size={16}
        />
      </TouchableOpacity>

      <Collapsible isVisible={!collapsed}>
        <View
          style={{
            flexDirection: "row",
            gap: 16,
            paddingTop: 16,
            flexWrap: "wrap",
          }}
        >
          {!resolvedData && (
            <View
              style={{
                height: 200,
                width: "100%",
                backgroundColor: colors.card,
                borderRadius: 16,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: colors.placeholder,
                  fontFamily: "Manrope_600SemiBold",
                  fontSize: 16,
                }}
              >
                Loading...
              </Text>
            </View>
          )}

          {resolvedData && (
            <ChatMessageSourceKAsProfileCard
              ual={ual}
              title={title}
              issuer={issuer}
              {...resolvedData}
            />
          )}

          {/* Explorer */}
          {resolvedData && (
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 16,
                flex: 2,
                justifyContent: "center",
                alignItems: "center",
                minWidth: 300,
                overflow: "hidden",
              }}
            >
              <GraphView ual={ual} assertion={resolvedData.assertion} />
            </View>
          )}
        </View>
      </Collapsible>
    </View>
  );
}
