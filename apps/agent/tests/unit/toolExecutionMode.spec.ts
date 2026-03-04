import { expect } from "chai";

import {
  TOOL_EXECUTION_MODE_OPTIONS,
  type ToolExecutionMode,
  toToolExecutionMode,
  toToolExecutionSettings,
} from "../../src/shared/toolExecutionMode";

/**
 * Unit tests for the tool execution mode contract used by:
 * - chat input mode dropdown
 * - persisted user settings
 */
describe("toolExecutionMode mappings", () => {
  it("maps each mode to the exact persisted settings expected by chat execution", () => {
    // Concrete regression guard: each mode must persist the right flags.
    const expected: Record<
      ToolExecutionMode,
      {
        autoApproveMcpTools: boolean;
        showMcpToolExecutionPanels: boolean;
      }
    > = {
      ask: {
        autoApproveMcpTools: false,
        showMcpToolExecutionPanels: true,
      },
      auto_show: {
        autoApproveMcpTools: true,
        showMcpToolExecutionPanels: true,
      },
      auto_silent: {
        autoApproveMcpTools: true,
        showMcpToolExecutionPanels: false,
      },
    };

    (Object.keys(expected) as ToolExecutionMode[]).forEach((mode) => {
      expect(toToolExecutionSettings(mode)).to.deep.equal(expected[mode]);
    });
  });

  it("maps persisted settings back to the mode shown in the input dropdown", () => {
    expect(
      toToolExecutionMode({
        autoApproveMcpTools: false,
        showMcpToolExecutionPanels: true,
      }),
    ).to.equal("ask");

    expect(
      toToolExecutionMode({
        autoApproveMcpTools: true,
        showMcpToolExecutionPanels: true,
      }),
    ).to.equal("auto_show");

    expect(
      toToolExecutionMode({
        autoApproveMcpTools: true,
        showMcpToolExecutionPanels: false,
      }),
    ).to.equal("auto_silent");
  });

  it("round-trips mode -> settings -> mode without losing intent", () => {
    (["ask", "auto_show", "auto_silent"] as ToolExecutionMode[]).forEach(
      (mode) => {
        const persisted = toToolExecutionSettings(mode);
        expect(toToolExecutionMode(persisted)).to.equal(mode);
      },
    );
  });

  it("keeps mode options complete and unique for the dropdown list", () => {
    const optionValues = TOOL_EXECUTION_MODE_OPTIONS.map(
      (option) => option.value,
    );
    const uniqueValues = new Set(optionValues);

    // QA guard: each mode appears exactly once in the selector.
    expect(uniqueValues.size).to.equal(optionValues.length);
    expect(optionValues).to.have.members(["ask", "auto_show", "auto_silent"]);

    TOOL_EXECUTION_MODE_OPTIONS.forEach((option) => {
      expect(option.title.trim().length).to.be.greaterThan(0);
      expect(option.description.trim().length).to.be.greaterThan(0);
    });
  });
});
