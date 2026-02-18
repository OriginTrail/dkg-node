export const CHAT_INPUT_MIN_VISIBLE_LINES = 1;
export const CHAT_INPUT_MAX_SHIFT_ENTER_COUNT = 10;
export const CHAT_INPUT_MAX_VISIBLE_LINES =
  CHAT_INPUT_MIN_VISIBLE_LINES + CHAT_INPUT_MAX_SHIFT_ENTER_COUNT;
export const CHAT_INPUT_LINE_HEIGHT = 24;
export const CHAT_INPUT_VERTICAL_PADDING = 11;

export const CHAT_INPUT_MIN_HEIGHT =
  CHAT_INPUT_VERTICAL_PADDING * 2 +
  CHAT_INPUT_LINE_HEIGHT * CHAT_INPUT_MIN_VISIBLE_LINES;
export const CHAT_INPUT_MAX_HEIGHT =
  CHAT_INPUT_VERTICAL_PADDING * 2 +
  CHAT_INPUT_LINE_HEIGHT * CHAT_INPUT_MAX_VISIBLE_LINES;

export function getChatInputHeight(
  contentHeight: number | null | undefined,
): number {
  if (typeof contentHeight !== "number" || !Number.isFinite(contentHeight)) {
    return CHAT_INPUT_MIN_HEIGHT;
  }

  return Math.min(
    CHAT_INPUT_MAX_HEIGHT,
    Math.max(CHAT_INPUT_MIN_HEIGHT, Math.ceil(contentHeight)),
  );
}

export function getChatInputHeightFromText(text: string): number {
  const explicitLines = Math.max(1, text.split(/\r\n|\r|\n/).length);
  const estimatedHeight =
    CHAT_INPUT_VERTICAL_PADDING * 2 + CHAT_INPUT_LINE_HEIGHT * explicitLines;
  return getChatInputHeight(estimatedHeight);
}
