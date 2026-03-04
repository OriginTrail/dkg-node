export function shouldStopGenerating(pendingToolCallsSize: number): boolean {
  return pendingToolCallsSize === 0;
}

export function isThinkingVisible(
  isGenerating: boolean,
  streamingContent: string | null,
): boolean {
  return isGenerating && streamingContent === null;
}
