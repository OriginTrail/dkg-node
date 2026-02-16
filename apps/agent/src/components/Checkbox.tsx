import { Pressable, StyleProp, View, ViewStyle } from "react-native";
import { PropsWithChildren } from "react";
import Svg, { Path } from "react-native-svg";

import useColors from "@/hooks/useColors";

export default function Checkbox(
  props: PropsWithChildren<{
    value?: boolean;
    onValueChange?: (value: boolean) => void;
    style?: StyleProp<ViewStyle>;
    testID?: string;
    disabled?: boolean;
  }>,
) {
  const colors = useColors();

  return (
    <Pressable
      disabled={props.disabled}
      style={[
        {
          padding: 6,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        },
        props.style,
        props.disabled && { opacity: 0.4 },
      ]}
      onPress={() => props.onValueChange?.(!props.value)}
      testID={props.testID}
    >
      <View
        style={[
          {
            width: 18,
            height: 18,
            borderWidth: 1,
            borderRadius: 4,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          },
          !props.value && {
            backgroundColor: "transparent",
            borderColor: colors.secondary,
          },
          props.value && {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
          },
        ]}
      >
        {props.value && (
          <Svg width={12} height={10} fill="none">
            <Path
              stroke="#fff"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.25 1.39 4.031 8.61.75 5.327"
            />
          </Svg>
        )}
      </View>
      {props.children}
    </Pressable>
  );
}
