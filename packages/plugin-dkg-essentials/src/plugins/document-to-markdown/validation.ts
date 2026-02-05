/**
 * Shared validation utilities for document-to-markdown conversion.
 * These are provider-agnostic and used across all implementations.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".pptx"] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export const MIME_TYPE_MAP: Record<SupportedExtension, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Get file extension from filename (lowercase, includes dot)
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Validate file type is supported
 * @throws Error if file type is not supported
 */
export function validateFileType(filename: string): SupportedExtension {
  const ext = getFileExtension(filename);
  if (!SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension)) {
    throw new Error(
      `Unsupported file type: '${ext || "(no extension)"}'. ` +
        `Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
    );
  }
  return ext as SupportedExtension;
}

/**
 * Validate file size is within limits
 * @throws Error if file is too large
 */
export function validateFileSize(sizeBytes: number): void {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    throw new Error(
      `File size (${sizeMB}MB) exceeds maximum of ${MAX_FILE_SIZE_MB}MB.`,
    );
  }
}

/**
 * Get MIME type for a supported file extension
 */
export function getMimeType(extension: SupportedExtension): string {
  return MIME_TYPE_MAP[extension];
}

/**
 * Get base filename without extension
 */
export function getBasename(filename: string): string {
  const ext = getFileExtension(filename);
  if (!ext) return filename;
  return filename.slice(0, -ext.length);
}
