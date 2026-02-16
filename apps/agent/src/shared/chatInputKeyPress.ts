export type ChatInputKeyAction = "submit" | "newline" | "noop";

export function getChatInputKeyAction(
  event: { key?: string; shiftKey?: boolean } | null | undefined,
): ChatInputKeyAction {
  if (event?.key !== "Enter") return "noop";
  return event.shiftKey ? "newline" : "submit";
}
