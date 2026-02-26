import { useState, useMemo, useCallback } from "react";

import { ToolInfo } from "./useMcpClientConnection";

type ToolCallsMap = Record<
  string,
  {
    input?: unknown;
    output?: unknown;
    status: "init" | "loading" | "success" | "error" | "cancelled";
    error?: string;
  }
>;

export default function useMcpToolsSession(availableTools: ToolInfo[]) {
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallsMap>({});
  const [toolsAllowed, setToolsAllowed] = useState<string[]>([]);

  const enabledTools = useMemo(() => {
    return availableTools.reduce<
      {
        type: "function";
        function: {
          name: string;
          description?: string;
          parameters: Record<string, unknown>;
        };
      }[]
    >((acc, tool) => {
      if (disabledTools.includes(tool.name)) return acc;
      return [
        ...acc,
        {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.args,
          },
        },
      ];
    }, []);
  }, [disabledTools, availableTools]);

  const toggleTool = useCallback(
    (toolName: string, enabled?: boolean) => {
      enabled = enabled ?? !disabledTools.includes(toolName);
      if (enabled) {
        setDisabledTools(disabledTools.filter((name) => name !== toolName));
      } else {
        setDisabledTools([...disabledTools, toolName]);
      }
    },
    [disabledTools],
  );

  const toggleAllTools = useCallback(
    (enabled: boolean) =>
      setDisabledTools(enabled ? [] : availableTools.map((t) => t.name)),
    [availableTools],
  );

  const isEnabled = useCallback(
    (toolName: string) => !disabledTools.includes(toolName),
    [disabledTools],
  );

  const saveCallInfo = useCallback((id: string, info: ToolCallsMap[string]) => {
    setToolCalls((prev) => ({ ...prev, [id]: info }));
  }, []);

  const getCallInfo = useCallback((id: string) => toolCalls[id], [toolCalls]);

  const allowForSession = useCallback((id: string) => {
    setToolsAllowed((allowedTools) =>
      allowedTools.includes(id) ? allowedTools : [...allowedTools, id],
    );
  }, []);

  const clearAllowedForSession = useCallback(() => {
    setToolsAllowed([]);
  }, []);

  const isAllowedForSession = useCallback(
    (id: string) => toolsAllowed.includes(id),
    [toolsAllowed],
  );

  const reset = useCallback(() => {
    setDisabledTools([]);
    setToolCalls({});
    setToolsAllowed([]);
  }, []);

  return {
    enabled: enabledTools,
    toggle: toggleTool,
    toggleAll: toggleAllTools,
    isEnabled,
    saveCallInfo,
    getCallInfo,
    allowForSession,
    clearAllowedForSession,
    isAllowedForSession,
    reset,
  };
}
