import { DocumentValidationError } from "./validation";

export interface ClassifiedConversionError {
  status: number;
  message: string;
  isUserError: boolean;
}

const USER_INPUT_ERROR_PATTERNS: RegExp[] = [
  /^Either 'blobId' or 'fileBase64' must be provided\.$/,
  /^Provide either 'blobId' or 'fileBase64', not both\.$/,
  /^Document blob not found:/,
  /only supports \.pdf files/,
];

function isDocumentValidationErrorLike(
  error: unknown,
): error is { statusCode: 400 | 413; message: string } {
  if (error instanceof DocumentValidationError) {
    return true;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    statusCode?: unknown;
    message?: unknown;
    name?: unknown;
  };

  return (
    (candidate.statusCode === 400 || candidate.statusCode === 413) &&
    typeof candidate.message === "string" &&
    (candidate.name === undefined || candidate.name === "DocumentValidationError")
  );
}

function isUserInputError(message: string): boolean {
  return USER_INPUT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function classifyConversionError(
  error: unknown,
): ClassifiedConversionError {
  const message = error instanceof Error ? error.message : String(error);

  if (isDocumentValidationErrorLike(error)) {
    return {
      status: error.statusCode,
      message,
      isUserError: true,
    };
  }

  if (isUserInputError(message)) {
    return {
      status: message.startsWith("Document blob not found:") ? 404 : 400,
      message,
      isUserError: true,
    };
  }

  return {
    status: 500,
    message,
    isUserError: false,
  };
}
