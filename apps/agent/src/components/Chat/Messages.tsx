import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  View,
} from "react-native";

import useColors from "@/hooks/useColors";
import {
  SCROLLBAR_TRACK_INSET,
  SCROLLBAR_MIN_THUMB_HEIGHT,
  SCROLLBAR_THUMB_WIDTH,
  SCROLLBAR_TRACK_WIDTH,
  SCROLLBAR_THUMB_BORDER_RADIUS,
  SCROLLBAR_THUMB_OPACITY,
  SCROLLBAR_TRACK_RIGHT,
} from "@/shared/customScrollbar";

const isWeb = Platform.OS === "web";

// Vertical padding between the scrollbar track and the wrapper edges,
// so the track doesn't butt up against the header or the chat input.
const SCROLLBAR_TRACK_VERTICAL_PADDING = 16;

type ScrollbarEventLike = {
  nativeEvent?: { pageY?: unknown; preventDefault?: () => void };
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

export default forwardRef<ScrollView, ScrollViewProps>(
  function ChatMessages(props, ref) {
    const colors = useColors();

    const [thumbTop, setThumbTop] = useState(SCROLLBAR_TRACK_INSET);
    const [thumbHeight, setThumbHeight] = useState(0);

    const scrollViewRef = useRef<ScrollView>(null);
    const scrollMetricsRef = useRef({
      scrollTop: 0,
      contentHeight: 0,
      viewportHeight: 0,
    });
    const dragStateRef = useRef<{
      startPageY: number;
      startScrollTop: number;
    } | null>(null);
    const restoreUserSelectRef = useRef<string | null>(null);

    // Compose forwarded ref with internal ref
    const setRefs = useCallback(
      (node: ScrollView | null) => {
        scrollViewRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<ScrollView | null>).current = node;
      },
      [ref],
    );

    useEffect(() => {
      return () => {
        dragStateRef.current = null;
        if (
          typeof document !== "undefined" &&
          restoreUserSelectRef.current !== null
        ) {
          document.body.style.userSelect = restoreUserSelectRef.current;
          restoreUserSelectRef.current = null;
        }
      };
    }, []);

    // --- Thumb calculation ---

    const updateThumb = (
      scrollTop: number,
      contentHeight: number,
      viewportHeight: number,
    ) => {
      const isScrollable = isWeb && contentHeight > viewportHeight + 1;

      if (!isScrollable) {
        setThumbTop(SCROLLBAR_TRACK_INSET);
        setThumbHeight(0);
        return;
      }

      const trackVisualHeight =
        viewportHeight - SCROLLBAR_TRACK_VERTICAL_PADDING * 2;
      const trackHeight = Math.max(
        0,
        trackVisualHeight - SCROLLBAR_TRACK_INSET * 2,
      );
      if (trackHeight <= 0) return;

      const newThumbHeight = Math.max(
        SCROLLBAR_MIN_THUMB_HEIGHT,
        Math.min(trackHeight, (viewportHeight / contentHeight) * trackHeight),
      );
      const maxScrollTop = Math.max(1, contentHeight - viewportHeight);
      const clampedScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop));
      const maxThumbOffset = Math.max(0, trackHeight - newThumbHeight);
      const newThumbTop =
        SCROLLBAR_TRACK_INSET +
        (clampedScrollTop / maxScrollTop) * maxThumbOffset;

      setThumbTop(newThumbTop);
      setThumbHeight(newThumbHeight);
    };

    // --- Scroll handler (composes with parent) ---

    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isWeb) {
        const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
        const metrics = {
          scrollTop: contentOffset.y,
          contentHeight: contentSize.height,
          viewportHeight: layoutMeasurement.height,
        };
        scrollMetricsRef.current = metrics;
        updateThumb(
          metrics.scrollTop,
          metrics.contentHeight,
          metrics.viewportHeight,
        );
      }
      props.onScroll?.(e);
    };

    // --- Content size change handler (composes with parent) ---

    const handleContentSizeChange = (w: number, h: number) => {
      if (isWeb) {
        const metrics = scrollMetricsRef.current;
        metrics.contentHeight = h;
        updateThumb(metrics.scrollTop, h, metrics.viewportHeight);
      }
      props.onContentSizeChange?.(w, h);
    };

    // --- Layout handler (composes with parent) ---

    const handleLayout = (e: any) => {
      if (isWeb) {
        const viewportHeight = e.nativeEvent.layout.height;
        const metrics = scrollMetricsRef.current;
        metrics.viewportHeight = viewportHeight;
        updateThumb(metrics.scrollTop, metrics.contentHeight, viewportHeight);
      }
      props.onLayout?.(e);
    };

    // --- Drag handlers ---

    const getEventPageY = (event: unknown) => {
      const pageY = (event as ScrollbarEventLike | undefined)?.nativeEvent
        ?.pageY;
      return typeof pageY === "number" ? pageY : null;
    };

    const cancelEventSelection = (event: unknown) => {
      const e = event as ScrollbarEventLike | undefined;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      e?.nativeEvent?.preventDefault?.();
    };

    const onThumbResponderGrant = (event: unknown) => {
      if (!isWeb) return;

      const pageY = getEventPageY(event);
      if (pageY === null) return;

      cancelEventSelection(event);

      dragStateRef.current = {
        startPageY: pageY,
        startScrollTop: scrollMetricsRef.current.scrollTop,
      };

      if (typeof document !== "undefined") {
        restoreUserSelectRef.current = document.body.style.userSelect;
        document.body.style.userSelect = "none";
      }
    };

    const onThumbResponderMove = (event: unknown) => {
      if (!isWeb) return;
      const drag = dragStateRef.current;
      if (!drag) return;

      const pageY = getEventPageY(event);
      if (pageY === null) return;

      cancelEventSelection(event);

      const { contentHeight, viewportHeight } = scrollMetricsRef.current;
      const trackVisualHeight =
        viewportHeight - SCROLLBAR_TRACK_VERTICAL_PADDING * 2;
      const trackHeight = Math.max(
        1,
        trackVisualHeight - SCROLLBAR_TRACK_INSET * 2,
      );
      const currentThumbHeight = Math.max(
        SCROLLBAR_MIN_THUMB_HEIGHT,
        Math.min(trackHeight, (viewportHeight / contentHeight) * trackHeight),
      );
      const maxThumbOffset = Math.max(1, trackHeight - currentThumbHeight);
      const maxScrollTop = Math.max(1, contentHeight - viewportHeight);

      const deltaY = pageY - drag.startPageY;
      const nextScrollTop = Math.min(
        maxScrollTop,
        Math.max(
          0,
          drag.startScrollTop + (deltaY / maxThumbOffset) * maxScrollTop,
        ),
      );

      scrollViewRef.current?.scrollTo({ y: nextScrollTop, animated: false });

      // Optimistic thumb update (onScroll will also fire and reconcile)
      scrollMetricsRef.current.scrollTop = nextScrollTop;
      updateThumb(nextScrollTop, contentHeight, viewportHeight);
    };

    const onThumbResponderRelease = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;

      if (
        typeof document !== "undefined" &&
        restoreUserSelectRef.current !== null
      ) {
        document.body.style.userSelect = restoreUserSelectRef.current;
        restoreUserSelectRef.current = null;
      }
    };

    // --- Render ---

    const showThumb = isWeb && thumbHeight > 0;

    return (
      <View style={[styles.wrapper, props.style]}>
        <ScrollView
          ref={setRefs}
          {...props}
          testID="chat-messages"
          style={{ flex: 1 }}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleLayout}
          scrollEventThrottle={16}
        >
          {props.children}
        </ScrollView>

        {showThumb && (
          <View pointerEvents="box-none" style={styles.scrollbarTrack}>
            <View
              style={[
                styles.scrollbarThumb,
                {
                  top: thumbTop,
                  height: thumbHeight,
                  backgroundColor: colors.placeholder,
                },
              ]}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={onThumbResponderGrant}
              onResponderMove={onThumbResponderMove}
              onResponderRelease={onThumbResponderRelease}
              onResponderTerminate={onThumbResponderRelease}
              onResponderTerminationRequest={() => false}
            />
          </View>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    flex: 1,
  },
  scrollbarTrack: {
    position: "absolute",
    top: SCROLLBAR_TRACK_VERTICAL_PADDING,
    right: SCROLLBAR_TRACK_RIGHT,
    bottom: SCROLLBAR_TRACK_VERTICAL_PADDING,
    width: SCROLLBAR_TRACK_WIDTH,
  },
  scrollbarThumb: {
    position: "absolute",
    right: 0,
    width: SCROLLBAR_THUMB_WIDTH,
    borderRadius: SCROLLBAR_THUMB_BORDER_RADIUS,
    opacity: SCROLLBAR_THUMB_OPACITY,
  },
});
