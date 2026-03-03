type AuthContext = {
  authInfo?: {
    scopes?: string[];
  };
  extra?: {
    authInfo?: {
      scopes?: string[];
    };
  };
};

export type McpScopeDeniedResult = {
  content: { type: "text"; text: string }[];
  isError: true;
};

export type McpScopeGuardOptions<Output = unknown> = {
  // Fail-closed by default. Set true only for trusted non-authenticated flows.
  allowWhenScopeContextMissing?: boolean;
  onMissingScope?: (requiredScope: string) => Output | McpScopeDeniedResult;
};

function getScopesFromContext(context: unknown): string[] | undefined {
  const typedContext = context as AuthContext;
  const scopes =
    typedContext?.authInfo?.scopes ?? typedContext?.extra?.authInfo?.scopes;
  return Array.isArray(scopes) ? scopes : undefined;
}

function createDefaultMissingScopeError(
  requiredScope: string,
): McpScopeDeniedResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: "Forbidden",
            statusCode: 403,
            message: `Missing required scope: ${requiredScope}`,
            requiredScope,
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

export function withRequiredMcpScope<TInput, TResult>(
  requiredScope: string,
  handler: (input: TInput, context: unknown) => Promise<TResult> | TResult,
  options: McpScopeGuardOptions<TResult> = {},
): (
  input: TInput,
  context: unknown,
) => Promise<TResult | McpScopeDeniedResult> {
  // Flow:
  // 1) Read scopes from context.
  // 2) If missing/insufficient, return missing-scope response.
  // 3) Otherwise execute the original handler.
  const {
    allowWhenScopeContextMissing: allowWithoutScopeContext = false,
    onMissingScope = createDefaultMissingScopeError,
  } = options;

  return async (
    input: TInput,
    context: unknown,
  ): Promise<TResult | McpScopeDeniedResult> => {
    const scopes = getScopesFromContext(context);
    if (!scopes) {
      if (allowWithoutScopeContext) {
        return handler(input, context);
      }
      return onMissingScope(requiredScope);
    }

    if (!scopes.includes(requiredScope)) {
      return onMissingScope(requiredScope);
    }

    return handler(input, context);
  };
}
