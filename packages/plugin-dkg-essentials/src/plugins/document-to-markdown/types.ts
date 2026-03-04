/**
 * Shared types for document-to-markdown conversion.
 * These types define the provider contract and shared data structures.
 */

/**
 * Options for document conversion
 */
export interface DocumentConversionOptions {
  /** First page to process (1-indexed integer) */
  pageStart?: number;
  /** Last page to process (inclusive 1-indexed integer) */
  pageEnd?: number;
  /** Whether to extract images (default: true) */
  includeImages?: boolean;
}

/**
 * Represents an image extracted from a document during conversion
 */
export interface ExtractedImage {
  /** Image identifier (e.g., "img-0.jpeg") */
  id: string;
  /** Original image format (e.g., "jpeg", "png") */
  originalFormat: string;
  /** Raw image data */
  data: Buffer;
  /** Blob storage ID (set after upload) */
  blobId?: string;
}

/**
 * Output from document conversion (before blob integration)
 */
export interface DocumentConversionOutput {
  /** Converted markdown content */
  markdown: string;
  /** Extracted images */
  images: ExtractedImage[];
  /** Total number of pages in the source document */
  pageCount: number;
  /**
   * Number of pages included in the converted markdown output.
   * If omitted by a provider, it defaults to `pageCount`.
   */
  processedPageCount?: number;
}

/**
 * Final result after blob integration (includes storage IDs)
 */
export interface ConversionResult {
  /** Final markdown with blob URLs for images */
  markdown: string;
  /** Extracted images with blob IDs */
  images: ExtractedImage[];
  /** Total number of pages in the source document */
  pageCount: number;
  /** Number of pages included in the converted markdown output */
  processedPageCount: number;
  /** Folder ID in blob storage */
  outputFolderId: string;
  /** Blob ID for the markdown file */
  markdownBlobId: string;
}

/**
 * Provider contract for document-to-markdown conversion.
 * Implementations handle vendor-specific logic internally.
 */
export interface DocumentConversionProvider {
  /** Provider name for logging/identification */
  readonly name: string;

  /**
   * Convert a document buffer to markdown with optional image extraction.
   *
   * @param buffer - Document content as a Buffer
   * @param filename - Original filename (used for format detection)
   * @param options - Conversion options
   * @returns Converted markdown and extracted images
   * @throws Error if conversion fails or file type is unsupported
   */
  convert(
    buffer: Buffer,
    filename: string,
    options?: DocumentConversionOptions,
  ): Promise<DocumentConversionOutput>;
}

/**
 * Configuration for document conversion plugin
 */
export interface DocumentConversionConfig {
  /** Provider to use for conversion (default: auto-detected) */
  provider?: DocumentConversionProvider;
  /** Provider name to use if no provider instance given (default: "unpdf") */
  providerName?: string;
}
