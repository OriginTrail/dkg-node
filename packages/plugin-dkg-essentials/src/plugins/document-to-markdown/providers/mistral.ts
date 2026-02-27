/**
 * Mistral OCR provider for document-to-markdown conversion.
 * Uses Mistral's OCR API to convert PDF, DOCX, and PPTX to Markdown.
 */

import { Mistral } from "@mistralai/mistralai";
import { HTTPClient } from "@mistralai/mistralai/lib/http";
import type { OCRResponse } from "@mistralai/mistralai/models/components/ocrresponse";
import { fetch as undiciFetch, RequestInit as UndiciRequestInit } from "undici";

import type {
  DocumentConversionProvider,
  DocumentConversionOptions,
  DocumentConversionOutput,
  ExtractedImage,
} from "../types";
import { normalizePageRange } from "../page-range";
import { validateFileType, validateFileSize, getMimeType } from "../validation";

// ============================================================================
// CONSTANTS
// ============================================================================

const API_TIMEOUT_MS = 120000; // 2 minutes
const PROVIDER_NAME = "mistral";

// ============================================================================
// MISTRAL CLIENT SETUP
// ============================================================================

/**
 * Custom fetcher using undici's native Node.js fetch implementation.
 * This bypasses the bundled fetch polyfill that has issues with Request objects.
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
function createMistralClient(apiKey: string): Mistral {
  const httpClient = new HTTPClient({ fetcher: customFetcher });
  return new Mistral({ apiKey, httpClient });
}

// ============================================================================
// RESPONSE PROCESSING
// ============================================================================

/**
 * Clean Mistral OCR response and format as markdown
 */
export function formatOcrResponseAsMarkdown(
  response: OCRResponse,
  startPage: number = 1,
): string {
  const fullMarkdown = response.pages
    .map(
      (page, index) =>
        `---\n\n## Page ${startPage + index}\n\n${page.markdown || ""}`,
    )
    .join("\n\n");
  return fullMarkdown;
}

/**
 * Extract images from Mistral OCR response pages.
 * Mistral returns images in a separate `images` array per page with:
 * - id: string (e.g., "img-0.jpeg")
 * - imageBase64: string (base64 encoded image data, when include_image_base64=true)
 */
function extractImagesFromResponse(response: OCRResponse): ExtractedImage[] {
  const images: ExtractedImage[] = [];

  for (const page of response.pages) {
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

// ============================================================================
// OCR API CALL
// ============================================================================

/**
 * Call Mistral OCR API to convert document
 */
async function callOcrApi(
  client: Mistral,
  documentBuffer: Buffer,
  mimeType: string,
  options?: DocumentConversionOptions,
): Promise<OCRResponse> {
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
  const ocrPromise = client.ocr.process({
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
  return response;
}

// ============================================================================
// PROVIDER IMPLEMENTATION
// ============================================================================

/**
 * Mistral OCR provider for document conversion.
 */
export class MistralProvider implements DocumentConversionProvider {
  readonly name = PROVIDER_NAME;
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    // Use provided key or fall back to environment variable
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    const key = apiKey ?? process.env.MISTRAL_API_KEY;
    if (!key) {
      throw new Error(
        "MISTRAL_API_KEY environment variable is not set. " +
          "Please configure your Mistral API key to use document conversion.",
      );
    }
    this.apiKey = key;
  }

  async convert(
    buffer: Buffer,
    filename: string,
    options?: DocumentConversionOptions,
  ): Promise<DocumentConversionOutput> {
    type InternalDocumentConversionOptions = DocumentConversionOptions & {
      __skipBaseValidation?: boolean;
      __validatedExtension?: ReturnType<typeof validateFileType>;
    };
    const internalOptions = options as InternalDocumentConversionOptions | undefined;

    // Validate file type and get MIME type
    const extension =
      internalOptions?.__validatedExtension ?? validateFileType(filename);
    const mimeType = getMimeType(extension);

    // Validate file size
    if (!internalOptions?.__skipBaseValidation) {
      validateFileSize(buffer.length);
    }

    // Create client and call OCR API
    const client = createMistralClient(this.apiKey);
    const response = await callOcrApi(client, buffer, mimeType, options);

    // Apply page range filter if specified
    let pages = response.pages;
    const { startPage, endPage, hasPageFilter } = normalizePageRange(
      pages.length,
      options,
    );
    if (hasPageFilter) {
      pages = pages.slice(startPage - 1, endPage);
    }

    const filteredResponse = { ...response, pages };

    // Format markdown
    const markdown = formatOcrResponseAsMarkdown(filteredResponse, startPage);

    // Extract images if enabled
    const includeImages = options?.includeImages !== false;
    const images = includeImages
      ? extractImagesFromResponse(filteredResponse)
      : [];

    if (images.length > 0) {
      console.log(`Extracted ${images.length} images from OCR response`);
    }

    return {
      markdown,
      images,
      pageCount: response.pages.length,
      processedPageCount: pages.length,
    };
  }
}

/**
 * Create a Mistral provider instance.
 * @param apiKey - Optional API key (defaults to MISTRAL_API_KEY env var)
 */
export function createMistralProvider(apiKey?: string): MistralProvider {
  return new MistralProvider(apiKey);
}
