import { expect } from "chai";

import { getChatInputKeyAction } from "../../src/shared/chatInputKeyPress";

describe("chat input key press", () => {
  describe("Core Functionality", () => {
    it("maps Enter to submit", () => {
      expect(getChatInputKeyAction({ key: "Enter" })).to.equal("submit");
    });

    it("maps Shift+Enter to newline", () => {
      expect(getChatInputKeyAction({ key: "Enter", shiftKey: true })).to.equal(
        "newline",
      );
    });

    it("ignores non-Enter keys", () => {
      expect(getChatInputKeyAction({ key: "a" })).to.equal("noop");
    });
  });

  describe("Error Handling", () => {
    it("returns noop when key event is missing", () => {
      expect(getChatInputKeyAction(undefined)).to.equal("noop");
      expect(getChatInputKeyAction(null)).to.equal("noop");
    });

    it("returns noop when key is absent", () => {
      expect(getChatInputKeyAction({})).to.equal("noop");
    });
  });
});
