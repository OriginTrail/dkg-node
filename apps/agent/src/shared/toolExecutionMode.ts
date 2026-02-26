export type ToolExecutionMode = "ask" | "auto_show" | "auto_silent";

export const TOOL_EXECUTION_MODE_OPTIONS: {
  value: ToolExecutionMode;
  title: string;
  description: string;
}[] = [
  {
    value: "ask",
    title: "Ask before running tools",
    description: "Show a confirmation panel before each tool call.",
  },
  {
    value: "auto_show",
    title: "Auto-run and show execution",
    description: "Run tools automatically and display tool inputs/outputs.",
  },
  {
    value: "auto_silent",
    title: "Auto-run silently",
    description: "Run tools automatically and hide execution panels.",
  },
];

export function toToolExecutionMode(settings: {
  autoApproveMcpTools: boolean;
  showMcpToolExecutionPanels: boolean;
}): ToolExecutionMode {
  if (!settings.autoApproveMcpTools) return "ask";
  return settings.showMcpToolExecutionPanels ? "auto_show" : "auto_silent";
}

export function toToolExecutionSettings(mode: ToolExecutionMode): {
  autoApproveMcpTools: boolean;
  showMcpToolExecutionPanels: boolean;
} {
  switch (mode) {
    case "ask":
      return {
        autoApproveMcpTools: false,
        showMcpToolExecutionPanels: true,
      };
    case "auto_show":
      return {
        autoApproveMcpTools: true,
        showMcpToolExecutionPanels: true,
      };
    case "auto_silent":
      return {
        autoApproveMcpTools: true,
        showMcpToolExecutionPanels: false,
      };
    default:
      return {
        autoApproveMcpTools: false,
        showMcpToolExecutionPanels: true,
      };
  }
}
