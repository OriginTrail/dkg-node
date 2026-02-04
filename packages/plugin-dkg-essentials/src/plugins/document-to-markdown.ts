/**
 * Document to Markdown MCP Tool
 *
 * Converts PDF, DOCX, and PPTX documents to Markdown using Mistral OCR.
 * Extracts images as separate blobs stored alongside the markdown output.
 *
 * Environment variables:
 * - MISTRAL_API_KEY (required)
 */

import { Readable } from "stream";
import consumers from "stream/consumers";
import { randomUUID } from "crypto";
import { defineDkgPlugin, DkgContext } from "@dkg/plugins";
import { z } from "@dkg/plugins/helpers";
import { Mistral } from "@mistralai/mistralai";
import { HTTPClient } from "@mistralai/mistralai/lib/http";
import type { OCRResponse } from "@mistralai/mistralai/models/components/ocrresponse";
import { fetch as undiciFetch, RequestInit as UndiciRequestInit } from "undici";

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const API_TIMEOUT_MS = 120000; // 2 minutes
const BLOB_PREFIX = "document-conversions";

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".pptx"] as const;
type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

const MIME_TYPE_MAP: Record<SupportedExtension, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface DocumentConversionOptions {
  pageStart?: number;
  pageEnd?: number;
  includeImages?: boolean;
}

interface ExtractedImage {
  id: string;
  originalFormat: string;
  data: Buffer;
  blobId?: string;
}

interface ConversionResult {
  markdown: string;
  images: ExtractedImage[];
  pageCount: number;
  outputFolderId: string;
  markdownBlobId: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate that MISTRAL_API_KEY is set
 * @throws Error if API key is missing
 */
function validateMistralApiKey(): string {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MISTRAL_API_KEY environment variable is not set. " +
        "Please configure your Mistral API key to use document conversion.",
    );
  }
  return apiKey;
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Validate file type is supported
 * @throws Error if file type is not supported
 */
function validateFileType(filename: string): SupportedExtension {
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
function validateFileSize(sizeBytes: number): void {
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
function getMimeType(extension: SupportedExtension): string {
  return MIME_TYPE_MAP[extension];
}

/**
 * Get base filename without extension
 */
function getBasename(filename: string): string {
  const ext = getFileExtension(filename);
  if (!ext) return filename;
  return filename.slice(0, -ext.length);
}

// ============================================================================
// MISTRAL CLIENT SETUP
// ============================================================================

/**
 * Custom fetcher using undici's native Node.js fetch implementation
 * This bypasses the bundled fetch polyfill that has issues with Request objects
 */
const customFetcher = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  // If input is a Request object, extract the URL and merge options
  if (input instanceof Request) {
    const url = input.url;
    const mergedInit = {
      method: input.method,
      headers: input.headers,
      body: input.body,
      duplex: input.body ? "half" : undefined,
      ...init,
    } as UndiciRequestInit;
    return undiciFetch(url, mergedInit) as unknown as Promise<Response>;
  }

  // Check if it looks like a Request but isn't detected as one (bundler issue)
  if (
    typeof input === "object" &&
    input !== null &&
    "url" in input &&
    "method" in input
  ) {
    const requestLike = input as {
      url: string;
      method: string;
      headers?: unknown;
      body?: unknown;
    };
    const mergedInit = {
      method: requestLike.method,
      headers: requestLike.headers,
      body: requestLike.body,
      duplex: requestLike.body ? "half" : undefined,
      ...init,
    } as UndiciRequestInit;
    return undiciFetch(
      requestLike.url,
      mergedInit,
    ) as unknown as Promise<Response>;
  }

  // Otherwise, pass through normally
  return undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    init as UndiciRequestInit,
  ) as unknown as Promise<Response>;
};

/**
 * Get a configured Mistral client instance
 */
function getMistralClient(apiKey: string): Mistral {
  const httpClient = new HTTPClient({ fetcher: customFetcher });
  return new Mistral({ apiKey, httpClient });
}

// ============================================================================
// IMAGE EXTRACTION
// ============================================================================

/**
 * Extract images from Mistral OCR response pages.
 * Mistral returns images in a separate `images` array per page with:
 * - id: string (e.g., "img-0.jpeg")
 * - imageBase64: string (base64 encoded image data, when include_image_base64=true)
 *
 * The markdown contains placeholders like: ![img-0.jpeg](img-0.jpeg)
 */
function extractImagesFromOCRResponse(response: OCRResponse): ExtractedImage[] {
  const images: ExtractedImage[] = [];

  for (const page of response.pages) {
    // Each page may have an images array
    const pageImages = page.images as
      | Array<{ id: string; imageBase64?: string }>
      | undefined;

    if (!pageImages || pageImages.length === 0) {
      continue;
    }

    for (const img of pageImages) {
      // Skip if no base64 data (happens when include_image_base64=false)
      if (!img.imageBase64) {
        console.warn(`Image ${img.id} has no base64 data - skipping`);
        continue;
      }

      // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,")
      let base64Data = img.imageBase64;
      const dataUrlMatch = base64Data.match(/^data:image\/[^;]+;base64,(.*)$/);
      if (dataUrlMatch && dataUrlMatch[1]) {
        base64Data = dataUrlMatch[1];
      }

      // Extract format from image ID (e.g., "img-0.jpeg" -> "jpeg")
      const formatMatch = img.id.match(/\.([a-zA-Z0-9]+)$/);
      const originalFormat = formatMatch?.[1]?.toLowerCase() ?? "png";

      images.push({
        id: img.id,
        originalFormat,
        data: Buffer.from(base64Data, "base64"),
      });
    }
  }

  return images;
}

/**
 * Replace image filename references in markdown with blob URLs.
 * Transforms: ![img-0.jpeg](img-0.jpeg) -> ![img-0.jpeg](dkg-blob://uuid)
 */
function replaceImageRefsWithBlobUrls(
  markdown: string,
  images: ExtractedImage[],
): string {
  let result = markdown;
  for (const image of images) {
    if (image.blobId) {
      // Replace both the src and keep the original filename in alt
      // Pattern: ![anything](img-0.jpeg) or ![](img-0.jpeg)
      const pattern = new RegExp(
        `(!\\[[^\\]]*\\])\\(${escapeRegExp(image.id)}\\)`,
        "g",
      );
      result = result.replace(pattern, `$1(dkg-blob://${image.blobId})`);
    }
  }
  return result;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// OCR CONVERSION
// ============================================================================

/**
 * Clean Mistral OCR response and format as markdown
 */
function cleanMistralResponse(response: OCRResponse): string {
  const fullMarkdown = response.pages
    .map(
      (page, index) => `---\n\n## Page ${index + 1}\n\n${page.markdown || ""}`,
    )
    .join("\n\n");
  return fullMarkdown;
}

/**
 * Convert document buffer to markdown using Mistral OCR API
 * Returns both the markdown and the full OCR response (for image extraction)
 */
async function convertDocumentToMarkdown(
  documentBuffer: Buffer,
  mimeType: string,
  apiKey: string,
  options?: DocumentConversionOptions,
): Promise<{ markdown: string; pageCount: number; ocrResponse: OCRResponse }> {
  const mistralClient = getMistralClient(apiKey);
  const base64Document = documentBuffer.toString("base64");

  console.log("Calling Mistral OCR API to convert document to markdown...");

  // Create timeout promise for race condition
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Mistral OCR request timed out after ${API_TIMEOUT_MS / 1000} seconds. ` +
            "The document may be too large or complex.",
        ),
      );
    }, API_TIMEOUT_MS);
  });

  // Create OCR processing promise
  const ocrPromise = mistralClient.ocr.process({
    model: "mistral-ocr-latest",
    document: {
      type: "document_url",
      documentUrl: `data:${mimeType};base64,${base64Document}`,
    },
    includeImageBase64: options?.includeImages !== false,
  });

  // Race between OCR and timeout, then clean up the timer
  const response = await Promise.race([ocrPromise, timeoutPromise]).finally(
    () => clearTimeout(timeoutId),
  );

  console.log("Mistral OCR API response received.");

  // Apply page range filter if specified
  let pages = response.pages;
  if (options?.pageStart !== undefined || options?.pageEnd !== undefined) {
    const start = (options.pageStart ?? 1) - 1; // Convert to 0-indexed
    const end = options.pageEnd ?? pages.length;
    pages = pages.slice(Math.max(0, start), end);
  }

  const filteredResponse = { ...response, pages };
  const markdown = cleanMistralResponse(filteredResponse);

  return {
    markdown,
    pageCount: response.pages.length,
    ocrResponse: filteredResponse,
  };
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Process a document and convert it to markdown with image extraction
 */
async function processDocument(
  ctx: DkgContext,
  documentBuffer: Buffer,
  filename: string,
  options?: DocumentConversionOptions,
): Promise<ConversionResult> {
  // Validate API key
  const apiKey = validateMistralApiKey();

  // Validate file type and get MIME type
  const extension = validateFileType(filename);
  const mimeType = getMimeType(extension);

  // Validate file size
  validateFileSize(documentBuffer.length);

  // Convert document to markdown
  const { markdown, pageCount, ocrResponse } = await convertDocumentToMarkdown(
    documentBuffer,
    mimeType,
    apiKey,
    options,
  );

  // Extract images from OCR response if enabled
  const includeImages = options?.includeImages !== false;
  let finalMarkdown = markdown;
  const images: ExtractedImage[] = [];

  if (includeImages) {
    const extractedImages = extractImagesFromOCRResponse(ocrResponse);
    images.push(...extractedImages);
    console.log(`Extracted ${images.length} images from OCR response`);
  }

  // Create output folder with UUID
  const folderId = randomUUID();
  const baseName = getBasename(filename);

  // Upload extracted images as blobs (preserving original format)
  // Use blob.put() with explicit ID to control exact path (blob.create auto-prefixes a UUID)
  for (const image of images) {
    const imageFilename = `${image.id}`;  // ID already includes extension (e.g., "img-0.jpeg")
    const imageBlobId = `${BLOB_PREFIX}/${folderId}/${imageFilename}`;
    const imageStream = Readable.toWeb(Readable.from(image.data));
    await ctx.blob.put(imageBlobId, imageStream, {
      name: imageFilename,
      mimeType: `image/${image.originalFormat}`,
    });
    image.blobId = imageBlobId;
    console.log(`Uploaded image ${image.id} as blob: ${imageBlobId}`);
  }

  // Replace image filename references with blob URLs
  if (images.length > 0) {
    finalMarkdown = replaceImageRefsWithBlobUrls(finalMarkdown, images);
  }

  // Upload markdown as blob
  const markdownFilename = `${baseName}.md`;
  const markdownBlobId = `${BLOB_PREFIX}/${folderId}/${markdownFilename}`;
  const markdownBuffer = Buffer.from(finalMarkdown, "utf-8");
  const markdownStream = Readable.toWeb(Readable.from(markdownBuffer));
  await ctx.blob.put(markdownBlobId, markdownStream, {
    name: markdownFilename,
    mimeType: "text/markdown",
  });

  console.log(`Uploaded markdown as blob: ${markdownBlobId}`);

  return {
    markdown: finalMarkdown,
    images,
    pageCount,
    outputFolderId: folderId,
    markdownBlobId,
  };
}

// ============================================================================
// MCP TOOL REGISTRATION
// ============================================================================

export default defineDkgPlugin((ctx, mcp) => {
  mcp.registerTool(
    "document-to-markdown",
    {
      title: "Document to Markdown",
      description:
        "Convert PDF, DOCX, or PPTX documents to Markdown using Mistral OCR. " +
        "Extracts text and images from documents. Use this as the first step when publishing documents to the DKG - " +
        "the markdown output can then be transformed to JSON-LD and published using dkg-create.",
      inputSchema: {
        blobId: z
          .string()
          .optional()
          .describe("ID of a previously uploaded document blob"),
        fileBase64: z
          .string()
          .optional()
          .describe("Base64-encoded document content"),
        filename: z
          .string()
          .describe(
            "Original filename with extension (e.g., 'report.pdf', 'document.docx')",
          ),
        options: z
          .object({
            pageStart: z
              .number()
              .optional()
              .describe("First page to process (1-indexed)"),
            pageEnd: z
              .number()
              .optional()
              .describe("Last page to process (inclusive)"),
            includeImages: z
              .boolean()
              .optional()
              .describe("Whether to extract images (default: true)"),
          })
          .optional()
          .describe("Conversion options"),
      },
    },
    async (input) => {
      try {
        // Validate input: require either blobId or fileBase64
        if (!input.blobId && !input.fileBase64) {
          throw new Error("Either 'blobId' or 'fileBase64' must be provided.");
        }
        if (input.blobId && input.fileBase64) {
          throw new Error("Provide either 'blobId' or 'fileBase64', not both.");
        }

        // Get document content
        let documentBuffer: Buffer;

        if (input.blobId) {
          const blob = await ctx.blob.get(input.blobId);
          if (!blob) {
            throw new Error(`Document blob not found: ${input.blobId}`);
          }
          documentBuffer = await consumers.buffer(blob.data);
        } else {
          documentBuffer = Buffer.from(input.fileBase64!, "base64");
        }

        // Process the document
        const result = await processDocument(
          ctx,
          documentBuffer,
          input.filename,
          input.options,
        );

        // Build response
        const imageInfo =
          result.images.length > 0
            ? `\n\n**Extracted Images:** ${result.images.length} image(s)\n` +
              result.images
                .map((img) => `- ${img.id}: \`${img.blobId}\``)
                .join("\n")
            : "";

        const response =
          `✅ Document successfully converted to Markdown.\n\n` +
          `**Output Folder:** ${result.outputFolderId}\n` +
          `**Markdown Blob ID:** ${result.markdownBlobId}\n` +
          `**Pages Processed:** ${result.pageCount}` +
          imageInfo +
          `\n\n---\n\n${result.markdown}`;

        return {
          content: [{ type: "text", text: response }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Error converting document to markdown:", message);

        return {
          content: [
            {
              type: "text",
              text: `❌ Document conversion failed: ${message}`,
            },
          ],
        };
      }
    },
  );
});
