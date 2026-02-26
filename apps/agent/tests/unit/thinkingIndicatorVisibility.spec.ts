import { expect } from "chai";
import {
  isThinkingVisible,
  shouldStopGenerating,
} from "../../src/shared/thinkingIndicator";

/**
 * Unit tests for the Thinking indicator visibility invariant.
 *
 * The Thinking indicator renders when `isGenerating && streamingContent === null`.
 * During auto-silent tool execution, `isGenerating` must stay true while
 * pendingToolCalls is non-empty — otherwise the indicator disappears and users
 * see blank space.
 *
 * The fix: `setIsGenerating(false)` is guarded by `pendingToolCalls.current.size === 0`
 * in every `finally` block of sendMessageStreaming, requestCompletionStreaming,
 * requestCompletion, and sendMessage.
 */

describe("Thinking indicator visibility", () => {
  describe("shouldStopGenerating", () => {
    it("returns true when no pending tool calls remain", () => {
      expect(shouldStopGenerating(0)).to.be.true;
    });

    it("returns false when tool calls are still pending", () => {
      expect(shouldStopGenerating(1)).to.be.false;
      expect(shouldStopGenerating(3)).to.be.false;
    });
  });

  describe("isThinkingVisible", () => {
    it("shows when generating and no streaming content", () => {
      expect(isThinkingVisible(true, null)).to.be.true;
    });

    it("hides when not generating", () => {
      expect(isThinkingVisible(false, null)).to.be.false;
    });

    it("hides when streaming content is present", () => {
      expect(isThinkingVisible(true, "Hello")).to.be.false;
      expect(isThinkingVisible(true, "")).to.be.false;
    });
  });

  describe("auto-silent tool execution scenario", () => {
    it("keeps Thinking visible while tools are executing silently", () => {
      // Simulate: LLM responded with tool_calls, stream done, finally block runs
      const pendingToolCalls = 2;
      const stopGenerating = shouldStopGenerating(pendingToolCalls);

      // Guard prevents setIsGenerating(false)
      expect(stopGenerating).to.be.false;

      // So isGenerating stays true, streamingContent is null (stream ended)
      const isGenerating = true; // not reset because guard blocked it
      const streamingContent = null;
      expect(isThinkingVisible(isGenerating, streamingContent)).to.be.true;
    });

    it("hides Thinking after all tools complete and final LLM response finishes", () => {
      // All tool calls resolved, requestCompletionStreaming finally block runs
      const pendingToolCalls = 0;
      const stopGenerating = shouldStopGenerating(pendingToolCalls);

      expect(stopGenerating).to.be.true;

      // isGenerating set to false
      const isGenerating = false;
      const streamingContent = null;
      expect(isThinkingVisible(isGenerating, streamingContent)).to.be.false;
    });

    it("hides Thinking when streaming content arrives (regardless of pending tools)", () => {
      // LLM is streaming the final answer
      const isGenerating = true;
      const streamingContent = "Here is the answer...";
      expect(isThinkingVisible(isGenerating, streamingContent)).to.be.false;
    });
  });
});
