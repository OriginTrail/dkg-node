import { forwardRef } from "react";
import { ScrollView, ScrollViewProps } from "react-native";

export default forwardRef<ScrollView, ScrollViewProps>(
  function ChatMessages(props, ref) {
    return (
      <ScrollView
        ref={ref}
        {...props}
        style={[{ flex: 1 }, props.style]}
      >
        {props.children}
      </ScrollView>
    );
  },
);
