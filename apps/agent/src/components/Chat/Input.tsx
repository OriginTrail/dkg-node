import { ComponentProps, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
  StyleProp,
  ViewStyle,
  StyleSheet,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import Button from "@/components/Button";
import Popover from "@/components/Popover";
import ArrowUpIcon from "@/components/icons/ArrowUpIcon";
import AttachFileIcon from "@/components/icons/AttachFileIcon";
import ChevronDownIcon from "@/components/icons/ChevronDownIcon";
import ToolsIcon from "@/components/icons/ToolsIcon";
import useColors from "@/hooks/useColors";
import { ChatMessage, toContents } from "@/shared/chat";
import { toError } from "@/shared/errors";
import { FileDefinition } from "@/shared/files";
import {
  type ToolExecutionMode,
  TOOL_EXECUTION_MODE_OPTIONS,
} from "@/shared/toolExecutionMode";
import {
  CHAT_INPUT_MAX_HEIGHT,
  CHAT_INPUT_LINE_HEIGHT,
  CHAT_INPUT_MIN_HEIGHT,
  CHAT_INPUT_VERTICAL_PADDING,
  getChatInputHeight,
  getChatInputHeightFromText,
} from "../../shared/chatInputHeight";
import { getChatInputKeyAction } from "../../shared/chatInputKeyPress";

import ChatInputFilesSelected from "./Input/FilesSelected";
import ChatInputToolsSelector from "./Input/ToolsSelector";

const CHAT_INPUT_SCROLLBAR_HIDE_DELAY_MS = 5000;
const CHAT_INPUT_SCROLLBAR_TRACK_INSET = 8;
const CHAT_INPUT_SCROLLBAR_MIN_THUMB_HEIGHT = 24;
const CHAT_INPUT_TEST_ID = "chat-input";
const CHAT_INPUT_SELECTOR = `[data-testid="${CHAT_INPUT_TEST_ID}"]`;

type ScrollbarEventLike = {
  currentTarget?: unknown;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  nativeEvent?: {
    pageY?: unknown;
    preventDefault?: () => void;
  };
};

const isHTMLElement = (value: unknown): value is HTMLElement =>
  typeof HTMLElement !== "undefined" && value instanceof HTMLElement;

const toInputDimension = (size: number) =>
  Math.max(CHAT_INPUT_MIN_HEIGHT, Math.ceil(size));

export default function ChatInput({
  onSendMessage,
  onUploadFiles,
  onUploadError,
  onAttachFiles,
  onFileRemoved,
  authToken,
  tools,
  toolExecutionMode = "ask",
  onToolExecutionModeChange,
  onToolTick,
  onToolServerTick,
  disabled,
  style,
}: {
  onSendMessage: (message: ChatMessage) => void;
  onUploadFiles: (
    files: DocumentPicker.DocumentPickerAsset[],
  ) => FileDefinition[] | Promise<FileDefinition[]>;
  onUploadError?: (error: Error) => void;
  onAttachFiles: (files: FileDefinition[]) => ChatMessage["content"];
  onFileRemoved?: (file: FileDefinition) => void;
  toolExecutionMode?: ToolExecutionMode;
  onToolExecutionModeChange?: (mode: ToolExecutionMode) => void;
  /* Required for previewing uploaded images */
  authToken?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
} & ComponentProps<typeof ChatInputToolsSelector>) {
  const colors = useColors();
  const [message, setMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileDefinition[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [inputHeight, setInputHeight] = useState(CHAT_INPUT_MIN_HEIGHT);
  const [isCustomScrollbarVisible, setIsCustomScrollbarVisible] = useState(false);
  const [customScrollbarThumbTop, setCustomScrollbarThumbTop] = useState(
    CHAT_INPUT_SCROLLBAR_TRACK_INSET,
  );
  const [customScrollbarThumbHeight, setCustomScrollbarThumbHeight] = useState(0);
  const hideScrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const inputScrollTopRef = useRef(0);
  const inputScrollableElementRef = useRef<HTMLElement | null>(null);
  const scrollbarDragStateRef = useRef<{
    startPageY: number;
    startScrollTop: number;
  } | null>(null);
  const restoreUserSelectRef = useRef<string | null>(null);
  const isBusy = disabled || isUploading;
  const isWeb = Platform.OS === "web";
  const isInputAtMaxHeight = inputHeight >= CHAT_INPUT_MAX_HEIGHT;
  const trimmedMessage = message.trim();
  const canSend = !!trimmedMessage && !isBusy;

  const activeMode = TOOL_EXECUTION_MODE_OPTIONS.find(
    (m) => m.value === toolExecutionMode,
  )!;

  const clearHideScrollbarTimeout = () => {
    if (!hideScrollbarTimeoutRef.current) return;
    clearTimeout(hideScrollbarTimeoutRef.current);
    hideScrollbarTimeoutRef.current = null;
  };

  const hideCustomScrollbar = () => {
    setIsCustomScrollbarVisible(false);
    clearHideScrollbarTimeout();
  };

  const scheduleHideCustomScrollbar = () => {
    clearHideScrollbarTimeout();
    hideScrollbarTimeoutRef.current = setTimeout(() => {
      setIsCustomScrollbarVisible(false);
      hideScrollbarTimeoutRef.current = null;
    }, CHAT_INPUT_SCROLLBAR_HIDE_DELAY_MS);
  };

  const updateCustomScrollbar = ({
    scrollTop,
    contentHeight,
    viewportHeight,
  }: {
    scrollTop: number;
    contentHeight: number;
    viewportHeight: number;
  }) => {
    const isScrollable =
      isWeb &&
      viewportHeight >= CHAT_INPUT_MAX_HEIGHT &&
      contentHeight > viewportHeight + 1;
    if (!isScrollable) {
      setCustomScrollbarThumbTop(CHAT_INPUT_SCROLLBAR_TRACK_INSET);
      setCustomScrollbarThumbHeight(0);
      hideCustomScrollbar();
      return;
    }

    const trackHeight = Math.max(
      0,
      viewportHeight - CHAT_INPUT_SCROLLBAR_TRACK_INSET * 2,
    );
    if (trackHeight <= 0) return;

    const thumbHeight = Math.max(
      CHAT_INPUT_SCROLLBAR_MIN_THUMB_HEIGHT,
      Math.min(trackHeight, (viewportHeight / contentHeight) * trackHeight),
    );
    const maxScrollTop = Math.max(1, contentHeight - viewportHeight);
    const clampedScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop));
    const maxThumbOffset = Math.max(0, trackHeight - thumbHeight);
    const thumbTop =
      CHAT_INPUT_SCROLLBAR_TRACK_INSET +
      (clampedScrollTop / maxScrollTop) * maxThumbOffset;

    setCustomScrollbarThumbTop(thumbTop);
    setCustomScrollbarThumbHeight(thumbHeight);
  };

  const getInputScrollableElement = (event?: unknown) => {
    const eventLike = event as ScrollbarEventLike | undefined;
    if (isHTMLElement(eventLike?.currentTarget)) return eventLike.currentTarget;
    if (inputScrollableElementRef.current) return inputScrollableElementRef.current;

    if (typeof document === "undefined") return null;
    const inputElement = document.querySelector(CHAT_INPUT_SELECTOR);
    return isHTMLElement(inputElement) ? inputElement : null;
  };

  const getEventPageY = (event: unknown) => {
    const pageY = (event as ScrollbarEventLike | undefined)?.nativeEvent?.pageY;
    return typeof pageY === "number" ? pageY : null;
  };

  const getInputScrollMetrics = (scrollElement: HTMLElement) => {
    const contentHeight = toInputDimension(scrollElement.scrollHeight);
    const viewportHeight = toInputDimension(scrollElement.clientHeight);

    const trackHeight = Math.max(
      1,
      viewportHeight - CHAT_INPUT_SCROLLBAR_TRACK_INSET * 2,
    );
    const thumbHeight = Math.max(
      CHAT_INPUT_SCROLLBAR_MIN_THUMB_HEIGHT,
      Math.min(trackHeight, (viewportHeight / contentHeight) * trackHeight),
    );
    const maxThumbOffset = Math.max(1, trackHeight - thumbHeight);
    const maxScrollTop = Math.max(1, contentHeight - viewportHeight);

    return { contentHeight, viewportHeight, maxThumbOffset, maxScrollTop };
  };

  const syncCustomScrollbarFromElement = ({
    scrollElement,
    scrollTop = scrollElement.scrollTop,
  }: {
    scrollElement: HTMLElement;
    scrollTop?: number;
  }) => {
    const { contentHeight, viewportHeight } = getInputScrollMetrics(scrollElement);
    const normalizedScrollTop = Math.max(0, scrollTop);

    inputScrollTopRef.current = normalizedScrollTop;
    updateCustomScrollbar({
      scrollTop: normalizedScrollTop,
      contentHeight,
      viewportHeight,
    });
  };

  const restoreDocumentUserSelect = () => {
    if (typeof document === "undefined" || restoreUserSelectRef.current === null) {
      return;
    }
    document.body.style.userSelect = restoreUserSelectRef.current;
    restoreUserSelectRef.current = null;
  };

  const cancelEventSelection = (event: unknown) => {
    const eventLike = event as ScrollbarEventLike | undefined;
    eventLike?.preventDefault?.();
    eventLike?.stopPropagation?.();
    eventLike?.nativeEvent?.preventDefault?.();
  };

  const onScrollbarThumbResponderGrant = (event: unknown) => {
    if (!isWeb || !isInputAtMaxHeight) return;

    const inputScrollableElement = getInputScrollableElement();
    if (!inputScrollableElement) return;

    const pageY = getEventPageY(event);
    if (pageY === null) return;

    cancelEventSelection(event);
    clearHideScrollbarTimeout();
    setIsCustomScrollbarVisible(true);

    inputScrollableElementRef.current = inputScrollableElement;
    scrollbarDragStateRef.current = {
      startPageY: pageY,
      startScrollTop: inputScrollableElement.scrollTop,
    };

    if (typeof document !== "undefined") {
      restoreUserSelectRef.current = document.body.style.userSelect;
      document.body.style.userSelect = "none";
    }
  };

  const onScrollbarThumbResponderMove = (event: unknown) => {
    if (!isWeb || !isInputAtMaxHeight) return;

    const dragState = scrollbarDragStateRef.current;
    const inputScrollableElement = inputScrollableElementRef.current;
    if (!dragState || !inputScrollableElement) return;

    const pageY = getEventPageY(event);
    if (pageY === null) return;

    cancelEventSelection(event);

    const { maxThumbOffset, maxScrollTop } =
      getInputScrollMetrics(inputScrollableElement);
    const deltaY = pageY - dragState.startPageY;
    const nextScrollTop = Math.min(
      maxScrollTop,
      Math.max(0, dragState.startScrollTop + (deltaY / maxThumbOffset) * maxScrollTop),
    );

    inputScrollableElement.scrollTop = nextScrollTop;
    syncCustomScrollbarFromElement({
      scrollElement: inputScrollableElement,
      scrollTop: nextScrollTop,
    });
  };

  const onScrollbarThumbResponderRelease = () => {
    if (!scrollbarDragStateRef.current) return;

    scrollbarDragStateRef.current = null;
    restoreDocumentUserSelect();
    scheduleHideCustomScrollbar();
  };

  useEffect(() => {
    return () => {
      clearHideScrollbarTimeout();
      scrollbarDragStateRef.current = null;
      restoreDocumentUserSelect();
    };
  }, []);

  const onMessageChange = (nextMessage: string) => {
    if (isWeb && nextMessage.length < message.length) {
      const estimatedHeight = getChatInputHeightFromText(nextMessage);
      setInputHeight((oldHeight) => {
        const nextHeight = Math.min(oldHeight, estimatedHeight);
        updateCustomScrollbar({
          scrollTop: inputScrollTopRef.current,
          contentHeight: estimatedHeight,
          viewportHeight: nextHeight,
        });
        return nextHeight;
      });
    }

    setMessage(nextMessage);
  };

  const onSubmit = () => {
    if (!canSend) return;
    onSendMessage({
      role: "user",
      content: [
        ...toContents(selectedFiles.length ? onAttachFiles(selectedFiles) : []),
        { type: "text", text: trimmedMessage },
      ],
    });
    setMessage("");
    setSelectedFiles([]);
    setInputHeight(CHAT_INPUT_MIN_HEIGHT);
    setCustomScrollbarThumbTop(CHAT_INPUT_SCROLLBAR_TRACK_INSET);
    setCustomScrollbarThumbHeight(0);
    inputScrollTopRef.current = 0;
    hideCustomScrollbar();
  };

  const onAttachFilesPress = async () => {
    setIsUploading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        base64: true,
        multiple: true,
      });
      if (!result.assets) return;
      const newFiles = await onUploadFiles(result.assets);
      setSelectedFiles((oldFiles) => [...new Set([...oldFiles, ...newFiles])]);
    } catch (error) {
      onUploadError?.(toError(error));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={[styles.root, style]}>
      {selectedFiles.length > 0 && (
        <ChatInputFilesSelected
          selectedFiles={selectedFiles}
          authToken={authToken}
          onRemove={(removedFile) => {
            setSelectedFiles((files) =>
              files.filter((f) => f.id !== removedFile.id),
            );
            onFileRemoved?.(removedFile);
          }}
        />
      )}

      <View
        style={[
          styles.composer,
          { backgroundColor: colors.input, borderColor: colors.backgroundFlat },
        ]}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              isWeb && styles.inputMultiline,
              isWeb && { height: inputHeight },
              { color: colors.text },
            ]}
            placeholder="Ask anything..."
            placeholderTextColor={colors.placeholder}
            onChangeText={onMessageChange}
            value={message}
            multiline={isWeb}
            scrollEnabled={!isWeb || isInputAtMaxHeight}
            testID={CHAT_INPUT_TEST_ID}
            onContentSizeChange={(
              event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
            ) => {
              if (!isWeb) return;

              const nextContentHeight = toInputDimension(
                event.nativeEvent.contentSize.height,
              );
              const nextHeight = getChatInputHeight(nextContentHeight);

              setInputHeight(nextHeight);
              updateCustomScrollbar({
                scrollTop: inputScrollTopRef.current,
                contentHeight: nextContentHeight,
                viewportHeight: nextHeight,
              });
            }}
            onScroll={(event) => {
              if (!isWeb || !isInputAtMaxHeight) return;

              const inputScrollableElement = getInputScrollableElement(event);
              if (!inputScrollableElement) return;
              inputScrollableElementRef.current = inputScrollableElement;

              syncCustomScrollbarFromElement({
                scrollElement: inputScrollableElement,
              });
              setIsCustomScrollbarVisible(true);
              scheduleHideCustomScrollbar();
            }}
            onKeyPress={(event) => {
              const action = getChatInputKeyAction(
                event.nativeEvent as { key?: string; shiftKey?: boolean },
              );
              if (action !== "submit") return;

              // Keep Enter as submit on web multiline input.
              (
                event as unknown as {
                  preventDefault?: () => void;
                }
              ).preventDefault?.();
              if (canSend) onSubmit();
            }}
          />

          {isWeb &&
            isInputAtMaxHeight &&
            isCustomScrollbarVisible &&
            customScrollbarThumbHeight > 0 && (
              <View pointerEvents="box-none" style={styles.inputScrollbarTrack}>
                <View
                  style={[
                    styles.inputScrollbarThumb,
                    {
                      top: customScrollbarThumbTop,
                      height: customScrollbarThumbHeight,
                      backgroundColor: colors.placeholder,
                    },
                  ]}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={onScrollbarThumbResponderGrant}
                  onResponderMove={onScrollbarThumbResponderMove}
                  onResponderRelease={onScrollbarThumbResponderRelease}
                  onResponderTerminate={onScrollbarThumbResponderRelease}
                  onResponderTerminationRequest={() => false}
                />
              </View>
            )}
        </View>

        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
            <Pressable
              style={[
                styles.inlineChip,
                { backgroundColor: colors.card, opacity: isBusy ? 0.6 : 1 },
              ]}
              disabled={isBusy}
              testID="chat-attach-file-button"
              onPress={onAttachFilesPress}
            >
              <AttachFileIcon
                stroke={colors.placeholder}
                width={14}
                height={14}
              />
              <Text style={[styles.inlineChipText, { color: colors.text }]}>
                Attach
              </Text>
            </Pressable>

            <View style={styles.modeSelectorContainer}>
              <Pressable
                style={[
                  styles.modeSelectorTrigger,
                  {
                    borderColor: colors.backgroundFlat,
                    backgroundColor: colors.card,
                    opacity: isBusy ? 0.6 : 1,
                  },
                ]}
                onPress={() => setIsModeDropdownOpen((o) => !o)}
                disabled={isBusy}
                testID="chat-tool-mode-dropdown-button"
              >
                <Text
                  numberOfLines={1}
                  style={[styles.modeSelectorTriggerText, { color: colors.text }]}
                >
                  {activeMode.title}
                </Text>
                <ChevronDownIcon
                  width={12}
                  height={8}
                  stroke={colors.placeholder}
                />
              </Pressable>

              {isModeDropdownOpen && (
                <View
                  style={[
                    styles.modeSelectorMenu,
                    {
                      borderColor: colors.input,
                      backgroundColor: colors.card,
                    },
                  ]}
                >
                  {TOOL_EXECUTION_MODE_OPTIONS.map((option) => {
                    return (
                      <Pressable
                        key={option.value}
                        style={[
                          styles.modeSelectorOption,
                          option.value === toolExecutionMode && {
                            backgroundColor: colors.backgroundFlat,
                          },
                        ]}
                        onPress={() => {
                          onToolExecutionModeChange?.(option.value);
                          setIsModeDropdownOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.modeSelectorOptionTitle,
                            { color: colors.text },
                          ]}
                        >
                          {option.title}
                        </Text>
                        <Text
                          style={[
                            styles.modeSelectorOptionDescription,
                            { color: colors.placeholder },
                          ]}
                        >
                          {option.description}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <Popover
              from={(isOpen, setIsOpen) => (
                <Pressable
                  style={[
                    styles.iconChip,
                    {
                      backgroundColor: isOpen ? colors.backgroundFlat : colors.card,
                    },
                  ]}
                  onPress={() => setIsOpen((o) => !o)}
                >
                  <ToolsIcon stroke={colors.placeholder} width={16} height={16} />
                </Pressable>
              )}
            >
              <ChatInputToolsSelector
                tools={tools}
                onToolTick={onToolTick}
                onToolServerTick={onToolServerTick}
              />
            </Popover>
          </View>
          <Button
            color="primary"
            icon={ArrowUpIcon}
            style={styles.actionButton}
            disabled={!canSend}
            onPress={onSubmit}
            testID="chat-send-button"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    position: "relative",
  },
  composer: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 8,
    gap: 8,
  },
  input: {
    borderRadius: 14,
    minHeight: CHAT_INPUT_MIN_HEIGHT,
    paddingHorizontal: 12,
    paddingVertical: CHAT_INPUT_VERTICAL_PADDING,
    fontSize: 16,
    lineHeight: CHAT_INPUT_LINE_HEIGHT,
  },
  inputContainer: {
    position: "relative",
  },
  inputMultiline: {
    textAlignVertical: "top",
    paddingRight: 16,
    borderRightWidth: 2,
    borderRightColor: "transparent",
  },
  inputScrollbarTrack: {
    position: "absolute",
    top: 0,
    right: 5,
    bottom: 0,
    width: 8,
  },
  inputScrollbarThumb: {
    position: "absolute",
    right: 0,
    width: 6,
    borderRadius: 999,
    opacity: 0.72,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  toolbarLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineChip: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  inlineChipText: {
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
  },
  iconChip: {
    height: 30,
    width: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  modeSelectorContainer: {
    position: "relative",
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 280,
    zIndex: 20,
  },
  modeSelectorTrigger: {
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modeSelectorTriggerText: {
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  modeSelectorMenu: {
    position: "absolute",
    bottom: 38,
    left: 0,
    width: 280,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  modeSelectorOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  modeSelectorOptionTitle: {
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  modeSelectorOptionDescription: {
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
  actionButton: {
    width: 32,
    height: 32,
  },
});
