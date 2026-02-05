/**
 * STANDALONE PROCESS DOCUMENT TOOL
 * 
 * This file contains all the code needed for the PDF-to-Markdown processing tool.
 * It's a self-contained version that includes all dependencies and helpers.
 * 
 * Main features:
 * - Converts PDF blob to base64
 * - Uses Mistral OCR API to convert PDF to Markdown
 * - Caches results to file system for development
 * - Returns markdown as a blob for further processing
 * 
 * Dependencies required:
 * - @mistralai/mistralai
 * - undici (for fetch)
 * - @dkg/plugins (for DkgContext and blob operations)
 * - stream/consumers (Node.js built-in)
 * - fs, path (Node.js built-in)
 * 
 * Environment variables:
 * - MISTRAL_API_KEY (required)
 */

import { BlobData, BlobMetadata, DkgContext } from "@dkg/plugins";
import { Mistral } from "@mistralai/mistralai";
import { HTTPClient } from "@mistralai/mistralai/lib/http";
import { OCRResponse } from "@mistralai/mistralai/models/components/ocrresponse";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import consumers from "stream/consumers";
import { fetch as undiciFetch, RequestInit as UndiciRequestInit } from "undici";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ContentItem_I {
  [x: string]: unknown;
  type: "text";
  text: string;
}

export interface MCPTool_Return_I {
  [x: string]: unknown;
  content: ContentItem_I[];
}

type FileType = "json" | "text";
export type CacheSubfolder = "queries" | "extraction";

// ============================================================================
// CACHE HELPER FUNCTIONS
// ============================================================================

/**
 * Get the cache directory path at the package root
 */
function getCacheDir(): string {
  // Navigate from src/tools/helpers to package root
  const packageRoot = path.resolve(__dirname, "..");
  return path.join(packageRoot, ".dev-cache");
}

/**
 * Get the full path for a cache subfolder
 */
function getSubfolderPath(subfolder: CacheSubfolder): string {
  return path.join(getCacheDir(), subfolder);
}

/**
 * Ensure the cache directory and subfolder exist
 */
function ensureCacheDir(subfolder?: CacheSubfolder): void {
  const cacheDir = getCacheDir();
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  if (subfolder) {
    const subfolderPath = getSubfolderPath(subfolder);
    if (!fs.existsSync(subfolderPath)) {
      fs.mkdirSync(subfolderPath, { recursive: true });
    }
  }
}

/**
 * Cache data to a file for faster development iterations
 * @param data - The data to cache (object or string)
 * @param filename - The filename to save as (including extension)
 * @param fileType - The file type: 'json' or 'text' (determines serialization)
 * @param subfolder - The subfolder to save in: 'queries' or 'extraction'
 */
export function cacheToFile(
  data: object | string,
  filename: string,
  fileType: FileType,
  subfolder: CacheSubfolder
): void {
  ensureCacheDir(subfolder);

  const filePath = path.join(getSubfolderPath(subfolder), filename);

  let content: string;
  if (fileType === "json") {
    content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  } else {
    content = typeof data === "object" ? JSON.stringify(data, null, 2) : data;
  }

  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`[DEV-CACHE] Saved to: ${filePath}`);
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
  init?: RequestInit
): Promise<Response> => {
  console.log("=== CUSTOM FETCHER DEBUG ===");
  console.log("input type:", typeof input);
  console.log("input constructor name:", input?.constructor?.name);
  console.log("input instanceof Request:", input instanceof Request);
  console.log("input instanceof URL:", input instanceof URL);
  console.log("typeof undiciFetch:", typeof undiciFetch);
  console.log("undiciFetch name:", undiciFetch?.name);

  // Try to log the input value safely
  if (typeof input === "string") {
    console.log("input (string):", input.substring(0, 200));
  } else if (input instanceof URL) {
    console.log("input (URL):", input.toString().substring(0, 200));
  } else if (input instanceof Request) {
    console.log("input (Request) url:", input.url);
    console.log("input (Request) method:", input.method);
  } else {
    console.log("input (unknown):", String(input).substring(0, 200));
    // Try to inspect properties
    try {
      console.log("input keys:", Object.keys(input as object));
      if ((input as any).url) {
        console.log("input.url:", (input as any).url);
      }
    } catch (e) {
      console.log("Could not inspect input:", e);
    }
  }

  console.log(
    "init:",
    init ? JSON.stringify(init, null, 2).substring(0, 500) : "undefined"
  );
  console.log("=== END DEBUG ===");

  // If input is a Request object, extract the URL and merge options
  if (input instanceof Request) {
    const url = input.url;
    console.log("Using Request branch, url:", url);
    const mergedInit = {
      method: input.method,
      headers: input.headers,
      body: input.body,
      // duplex: "half" is required when sending a streaming body
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
      headers?: any;
      body?: any;
    };
    console.log("Detected Request-like object, url:", requestLike.url);
    const mergedInit = {
      method: requestLike.method,
      headers: requestLike.headers,
      body: requestLike.body,
      // duplex: "half" is required when sending a streaming body
      duplex: requestLike.body ? "half" : undefined,
      ...init,
    } as UndiciRequestInit;
    return undiciFetch(
      requestLike.url,
      mergedInit
    ) as unknown as Promise<Response>;
  }

  // Otherwise, pass through normally
  console.log("Using default branch");
  return undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    init as UndiciRequestInit
  ) as unknown as Promise<Response>;
};

/**
 * Get a configured Mistral client instance
 */
export const getMistralClient = () => {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MISTRAL_API_KEY environment variable is required but not set"
    );
  }

  const httpClient = new HTTPClient({ fetcher: customFetcher });

  return new Mistral({ apiKey, httpClient });
};

// ============================================================================
// PDF PROCESSING FUNCTIONS
// ============================================================================

/**
 * Convert a PDF blob to base64 encoding
 */
export async function grabPdfBase64Encoding(pdfBlob: {
  data: BlobData;
  metadata: BlobMetadata;
}): Promise<string> {
  try {
    const buffer = await consumers.buffer(pdfBlob.data);
    const base64Pdf = buffer.toString("base64");
    return base64Pdf;
  } catch (error) {
    console.error("ERROR: Failed to convert PDF blob to base64", error);
    throw error;
  }
}

/**
 * Clean Mistral OCR response and format as markdown
 */
export function cleanMistralResponse(response: OCRResponse): string {
  const fullMarkdown = response.pages
    .map(
      (page, index) => `---\n\n## Page ${index + 1}\n\n${page.markdown || ""}`
    )
    .join("\n\n");
  return fullMarkdown;
}

/**
 * Convert base64 PDF to markdown using Mistral OCR API
 */
export async function convertBase64ToMarkdown(
  base64Pdf: string
): Promise<string> {
  const minstralClient = getMistralClient();

  try {
    console.log("Calling Mistral OCR API to convert base64 PDF to markdown.");
    const response = await minstralClient.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: "data:application/pdf;base64," + base64Pdf,
      },
      includeImageBase64: false,
    });
    console.log("Mistral OCR API response recieved.");
    const fullMarkdown = cleanMistralResponse(response);
    console.log("Full markdown length:", fullMarkdown.length);
    console.log(
      "First 100 characters of markdown:",
      fullMarkdown.substring(0, 100)
    );
    return fullMarkdown;
  } catch (error) {
    console.error("ERROR in convertBase64ToMarkdown", error);
    throw error;
  }
}

// ============================================================================
// MAIN PROCESS DOCUMENT FUNCTION
// ============================================================================

/**
 * Main function to process a PDF document and convert it to markdown
 * 
 * Flow:
 * 1. Get PDF blob from context
 * 2. Convert PDF to base64
 * 3. Call Mistral OCR API to convert to markdown
 * 4. Cache the markdown to file system
 * 5. Create a new blob with the markdown content
 * 6. Return the markdown blob ID and content
 * 
 * @param ctx - DKG context for blob operations
 * @param blob_id - ID of the PDF blob to process
 * @returns MCP tool return with markdown blob ID and content
 */
export async function processDocument(
  ctx: DkgContext,
  blob_id: string
): Promise<MCPTool_Return_I> {
  // Get the PDF Blob from context
  const pdfBlob = await ctx.blob.get(blob_id);
  if (!pdfBlob) throw new Error(`Blob with ID ${blob_id} not found`);

  // Convert the PDF Blob to base64
  let base64PDF: string | undefined = undefined;
  try {
    base64PDF = await grabPdfBase64Encoding(pdfBlob);
  } catch (error) {
    console.error("ERROR in processDocument", error);
    throw error;
  }

  // Convert the base64 PDF to markdown
  let markdown: string | undefined = undefined;
  try {
    markdown = await convertBase64ToMarkdown(base64PDF);
  } catch (error) {
    console.error("ERROR in converting base64PDF to markdown", error);
    throw error;
  }

  // Create the markdown Blob for later use
  const originalName = pdfBlob.metadata?.name || "document";
  const filename = originalName.replace(/\.pdf$/i, "") + ".md";
  const currentDate = new Date()
    .toISOString()
    .replaceAll(":", "_")
    .replaceAll(".", "_");
  cacheToFile(
    markdown,
    `${currentDate}__${originalName}.md`,
    "text",
    "extraction"
  );

  const markdownBuffer = Buffer.from(markdown, "utf-8");
  const markdownStream = Readable.toWeb(Readable.from(markdownBuffer));
  const { id: markdownBlobId } = await ctx.blob.create(markdownStream, {
    name: filename,
    mimeType: "text/markdown",
  });

  return {
    content: [
      {
        type: "text",
        text: `Okay, I've successfully processed your PDF document.\nMarkdown blob ID: ${markdownBlobId}\n\nBefore proceeding with ontology extraction, it's best to run a Quality Control review (Step 1) to verify that all data was extracted correctly from the PDF. Please review the Markdown content and click "continue" when ready to proceed.\n\nIMPORTANT: Do not call any markdown-to-jsonld tools until the user has reviewed QC Step 1 and clicked "continue".`,
      },
      {
        type: "text",
        text: markdownBlobId,
      },
      {
        // We need this to parse Markdown for the Qc Tool
        type: "text",
        text: `MARKDOWN_CONTENT_FOR_QC:\n${markdown}`,
      },
    ],
  };
}

// ============================================================================
// MCP TOOL REGISTRATION EXAMPLE
// ============================================================================

/**
 * Example of how to register this tool with MCP in the plugin index
 * 
 * In your plugin's main file (e.g., index.ts):
 * 
 * ```typescript
 * import { z } from "@dkg/plugin-swagger";
 * import { defineDkgPlugin } from "@dkg/plugins";
 * import { processDocument } from "./tools/process_document/process_document_standalone";
 * 
 * export default defineDkgPlugin((ctx, mcp, _api) => {
 *   mcp.registerTool(
 *     "process_document",
 *     {
 *       title: "Process Document - PDF to Markdown",
 *       description: "Processes a PDF document and converts it to Markdown format using Mistral OCR. Takes a blob_id of a PDF file and returns the markdown content as a new blob.",
 *       inputSchema: {
 *         blob_id: z.string().describe("The ID of the PDF blob to process"),
 *       },
 *     },
 *     async ({ blob_id }) => {
 *       try {
 *         console.log("[MCP Tool]: process_document");
 *         const processDocumentResult = await processDocument(ctx, blob_id);
 *         return processDocumentResult;
 *       } catch (error) {
 *         const msg = error instanceof Error ? error.message : String(error);
 *         return {
 *           content: [{ type: "text", text: `Error processing PDF: ${msg}` }],
 *         };
 *       }
 *     }
 *   );
 * });
 * ```
 */

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  processDocument,
  grabPdfBase64Encoding,
  convertBase64ToMarkdown,
  cleanMistralResponse,
  getMistralClient,
  cacheToFile,
};
