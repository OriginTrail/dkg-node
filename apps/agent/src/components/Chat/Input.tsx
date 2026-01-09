import { ComponentProps, useCallback, useState } from "react";
import {
  View,
  TextInput,
  StyleProp,
  ViewStyle,
  StyleSheet,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import Button from "@/components/Button";
import Popover from "@/components/Popover";
import ArrowUpIcon from "@/components/icons/ArrowUpIcon";
import MicrophoneIcon from "@/components/icons/MicrophoneIcon";
import AttachFileIcon from "@/components/icons/AttachFileIcon";
import ToolsIcon from "@/components/icons/ToolsIcon";
import useColors from "@/hooks/useColors";
import { ChatMessage, toContents } from "@/shared/chat";
import { toError } from "@/shared/errors";
import { FileDefinition } from "@/shared/files";

import ChatInputFilesSelected from "./Input/FilesSelected";
import ChatInputToolsSelector from "./Input/ToolsSelector";
import ChatInputAttachmentChip from "./Input/AttachmentChip";

export default function ChatInput({
  onSendMessage,
  onUploadFiles = (assets) =>
    assets.map((a) => ({
      id: a.uri,
      uri: a.uri,
      name: a.name,
      mimeType: a.mimeType,
    })),
  onUploadError,
  onAttachFiles = (files) =>
    files.map((f) => ({
      type: "file",
      file: {
        filename: f.name,
        file_data: f.uri,
      },
    })),
  onFileRemoved,
  authToken,
  tools = {},
  onToolTick,
  onToolServerTick,
  disabled,
  style,
}: {
  onSendMessage: (message: ChatMessage) => void;
  onUploadFiles?: (
    files: DocumentPicker.DocumentPickerAsset[],
  ) => FileDefinition[] | Promise<FileDefinition[]>;
  onUploadError?: (error: Error) => void;
  onAttachFiles?: (files: FileDefinition[]) => ChatMessage["content"];
  onFileRemoved?: (file: FileDefinition) => void;
  /* Required for previewing uploaded images */
  authToken?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
} & ComponentProps<typeof ChatInputToolsSelector>) {
  const colors = useColors();
  const [message, setMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileDefinition[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onSubmit = useCallback(() => {
    onSendMessage({
      role: "user",
      content: [
        ...toContents(selectedFiles.length ? onAttachFiles(selectedFiles) : []),
        { type: "text", text: message.trim() },
      ],
    });
    setMessage("");
    setSelectedFiles([]);
  }, [message, selectedFiles, onSendMessage, onAttachFiles]);

  return (
    <View style={[{ width: "100%", position: "relative" }, style]}>
      {!!selectedFiles.length && (
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

      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.input, color: colors.text },
          ]}
          placeholder="Ask anything..."
          placeholderTextColor={colors.placeholder}
          onChangeText={setMessage}
          value={message}
          multiline={false}
          testID="chat-input"
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === "Enter") {
              // Submit on Enter key press
              if (message.trim() && !disabled) {
                onSubmit();
              }
            }
          }}
        />
        <View style={styles.inputButtons}>
          <Button
            color="secondary"
            flat
            icon={MicrophoneIcon}
            iconMode="fill"
            style={styles.inputButton}
            disabled={disabled}
          />
          <Button
            color="primary"
            icon={ArrowUpIcon}
            style={styles.inputButton}
            disabled={!message.trim() || disabled || isUploading}
            onPress={onSubmit}
            testID="chat-send-button"
          />
        </View>
      </View>
      <View style={styles.inputTools}>
        <Button
          disabled={disabled || isUploading}
          color="secondary"
          flat
          icon={AttachFileIcon}
          text="Attach file(s)"
          style={{ height: "100%" }}
          testID="chat-attach-file-button"
          onPress={() => {
            setIsUploading(true);
            DocumentPicker.getDocumentAsync({
              base64: true,
              multiple: true,
            })
              .then((r) => {
                if (!r.assets) return [];
                return onUploadFiles(r.assets);
              })
              .then((newFiles) =>
                setSelectedFiles((oldFiles) => [
                  ...new Set([...oldFiles, ...newFiles]),
                ]),
              )
              .catch((error) => onUploadError?.(toError(error)))
              .finally(() => setIsUploading(false));
          }}
        />
        <Popover
          from={(isOpen, setIsOpen) => (
            <Button
              color="secondary"
              flat
              icon={ToolsIcon}
              style={{
                height: "100%",
                aspectRatio: 1,
                backgroundColor: isOpen ? colors.card : "transparent",
              }}
              onPress={() => setIsOpen((o) => !o)}
            />
          )}
        >
          <ChatInputToolsSelector
            tools={tools}
            onToolTick={onToolTick}
            onToolServerTick={onToolServerTick}
          />
        </Popover>
      </View>
    </View>
  );
}

ChatInput.FilesSelected = ChatInputFilesSelected;
ChatInput.ToolsSelector = ChatInputToolsSelector;
ChatInput.AttachmentChip = ChatInputAttachmentChip;

const styles = StyleSheet.create({
  inputContainer: {
    position: "relative",
    height: 56,
    width: "100%",
  },
  input: {
    borderRadius: 50,
    paddingLeft: 20,
    paddingRight: 116,
    paddingVertical: 16,
    height: 56,
    fontSize: 16,
    lineHeight: 24,
  },
  inputButtons: {
    position: "absolute",
    right: 0,
    padding: 4,
    gap: 4,
    flexDirection: "row",
    height: "100%",
  },
  inputButton: {
    height: "100%",
    aspectRatio: 1,
  },
  inputTools: {
    position: "relative",
    width: "100%",
    height: 40,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 8,
    paddingHorizontal: 8,
  },
});
