import { ComponentProps, useState } from "react";
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
  const isBusy = disabled || isUploading;
  const isWeb = Platform.OS === "web";
  const isInputAtMaxHeight = inputHeight >= CHAT_INPUT_MAX_HEIGHT;
  const trimmedMessage = message.trim();
  const canSend = !!trimmedMessage && !isBusy;

  const activeMode = TOOL_EXECUTION_MODE_OPTIONS.find(
    (m) => m.value === toolExecutionMode,
  )!;

  const onMessageChange = (nextMessage: string) => {
    if (isWeb && nextMessage.length < message.length) {
      const estimatedHeight = getChatInputHeightFromText(nextMessage);
      setInputHeight((oldHeight) => Math.min(oldHeight, estimatedHeight));
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
          testID="chat-input"
          onContentSizeChange={(
            event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
          ) => {
            if (!isWeb) return;
            setInputHeight(getChatInputHeight(event.nativeEvent.contentSize.height));
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
  inputMultiline: {
    textAlignVertical: "top",
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
