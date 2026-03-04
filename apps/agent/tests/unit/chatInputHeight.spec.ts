import { expect } from "chai";

import {
  CHAT_INPUT_LINE_HEIGHT,
  CHAT_INPUT_MAX_HEIGHT,
  CHAT_INPUT_MAX_SHIFT_ENTER_COUNT,
  CHAT_INPUT_MAX_VISIBLE_LINES,
  CHAT_INPUT_MIN_HEIGHT,
  CHAT_INPUT_VERTICAL_PADDING,
  getChatInputHeight,
  getChatInputHeightFromText,
} from "../../src/shared/chatInputHeight";

describe("chat input height", () => {
  describe("Core Functionality", () => {
    it("supports ten Shift+Enter new lines before reaching cap", () => {
      expect(CHAT_INPUT_MAX_VISIBLE_LINES).to.equal(
        CHAT_INPUT_MAX_SHIFT_ENTER_COUNT + 1,
      );
      expect(CHAT_INPUT_MAX_SHIFT_ENTER_COUNT).to.equal(10);
      expect(CHAT_INPUT_MAX_HEIGHT).to.equal(
        CHAT_INPUT_VERTICAL_PADDING * 2 +
          CHAT_INPUT_LINE_HEIGHT * CHAT_INPUT_MAX_VISIBLE_LINES,
      );
    });

    it("keeps minimum height for short content", () => {
      expect(getChatInputHeight(20)).to.equal(CHAT_INPUT_MIN_HEIGHT);
    });

    it("grows when content height is in range", () => {
      expect(getChatInputHeight(92.1)).to.equal(93);
    });

    it("caps growth at max height", () => {
      expect(getChatInputHeight(1000)).to.equal(CHAT_INPUT_MAX_HEIGHT);
    });

    it("derives height from explicit text line breaks", () => {
      expect(getChatInputHeightFromText("hello")).to.equal(
        CHAT_INPUT_MIN_HEIGHT,
      );
      expect(getChatInputHeightFromText("a\nb\nc")).to.equal(
        CHAT_INPUT_VERTICAL_PADDING * 2 + CHAT_INPUT_LINE_HEIGHT * 3,
      );
    });
  });

  describe("Error Handling", () => {
    it("falls back to minimum height for missing value", () => {
      expect(getChatInputHeight(undefined)).to.equal(CHAT_INPUT_MIN_HEIGHT);
      expect(getChatInputHeight(null)).to.equal(CHAT_INPUT_MIN_HEIGHT);
    });

    it("falls back to minimum height for invalid numbers", () => {
      expect(getChatInputHeight(Number.NaN)).to.equal(CHAT_INPUT_MIN_HEIGHT);
      expect(getChatInputHeight(Number.POSITIVE_INFINITY)).to.equal(
        CHAT_INPUT_MIN_HEIGHT,
      );
    });

    it("keeps minimum height for empty text", () => {
      expect(getChatInputHeightFromText("")).to.equal(CHAT_INPUT_MIN_HEIGHT);
    });
  });
});
