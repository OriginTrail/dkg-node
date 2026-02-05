/**
 * Document to Markdown MCP Tool
 *
 * Converts PDF, DOCX, and PPTX documents to Markdown using configurable OCR providers.
 * Default provider: Mistral OCR.
 *
 * Environment variables:
 * - MISTRAL_API_KEY (required for Mistral provider)
 * - DOCUMENT_CONVERSION_PROVIDER (optional, default: "mistral")
 */

import consumers from "stream/consumers";
import { defineDkgPlugin, DkgContext } from "@dkg/plugins";
import { z } from "@dkg/plugins/helpers";

import type {
  DocumentConversionProvider,
  DocumentConversionOptions,
  ConversionResult,
  DocumentConversionConfig,
} from "./types";
import { integrateWithBlobStorage } from "./blob-integration";
import { createProvider } from "./providers";

// Re-export types for external use
export type {
  DocumentConversionProvider,
  DocumentConversionOptions,
  DocumentConversionOutput,
  ConversionResult,
  ExtractedImage,
  DocumentConversionConfig,
} from "./types";

// Re-export provider utilities
export {
  createProvider,
  getDefaultProvider,
  getAvailableProviders,
  isProviderAvailable,
  MistralProvider,
  createMistralProvider,
} from "./providers";

// Re-export validation utilities
export {
  validateFileType,
  validateFileSize,
  getFileExtension,
  getBasename,
  getMimeType,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
} from "./validation";

/**
 * Process a document and convert it to markdown with image extraction.
 * Uses the provided provider for conversion, then integrates with blob storage.
 */
async function processDocument(
  ctx: DkgContext,
  provider: DocumentConversionProvider,
  documentBuffer: Buffer,
  filename: string,
  options?: DocumentConversionOptions,
): Promise<ConversionResult> {
  console.log(`Converting document using provider: ${provider.name}`);

  // Convert document using provider
  const output = await provider.convert(documentBuffer, filename, options);

  // Integrate with blob storage (upload images, upload markdown)
  const result = await integrateWithBlobStorage(ctx, output, filename);

  return result;
}

/**
 * Create the document-to-markdown plugin with optional configuration.
 *
 * @param config - Optional configuration for provider selection
 */
export function createDocumentToMarkdownPlugin(
  config?: DocumentConversionConfig,
) {
  return defineDkgPlugin((ctx, mcp) => {
    // Resolve provider: use provided instance, create by name, or use default
    let provider: DocumentConversionProvider;

    if (config?.provider) {
      provider = config.provider;
    } else {
      // Check environment variable for provider name
      const providerName =
        config?.providerName ??
        // eslint-disable-next-line turbo/no-undeclared-env-vars
        process.env.DOCUMENT_CONVERSION_PROVIDER ??
        "mistral";

      try {
        provider = createProvider(providerName);
      } catch (error) {
        // Log warning but don't fail plugin initialization
        // Provider errors will surface when the tool is actually used
        console.warn(
          `Document conversion provider "${providerName}" initialization deferred: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
        // Create a lazy provider that initializes on first use
        provider = createLazyProvider(providerName);
      }
    }

    console.log(
      `Document-to-markdown plugin initialized with provider: ${provider.name}`,
    );

    mcp.registerTool(
      "document-to-markdown",
      {
        title: "Document to Markdown",
        description:
          "Convert PDF, DOCX, or PPTX documents to Markdown using OCR. " +
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
            throw new Error(
              "Either 'blobId' or 'fileBase64' must be provided.",
            );
          }
          if (input.blobId && input.fileBase64) {
            throw new Error(
              "Provide either 'blobId' or 'fileBase64', not both.",
            );
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
            provider,
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
          const message =
            error instanceof Error ? error.message : String(error);
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
}

/**
 * Create a lazy provider that defers initialization until first use.
 * This allows the plugin to initialize even if provider config is missing.
 */
function createLazyProvider(providerName: string): DocumentConversionProvider {
  let actualProvider: DocumentConversionProvider | null = null;

  return {
    get name() {
      return actualProvider?.name ?? `${providerName} (lazy)`;
    },

    async convert(buffer, filename, options) {
      if (!actualProvider) {
        actualProvider = createProvider(providerName);
      }
      return actualProvider.convert(buffer, filename, options);
    },
  };
}

/**
 * Default plugin export - uses Mistral provider.
 * For custom provider configuration, use createDocumentToMarkdownPlugin().
 */
export default createDocumentToMarkdownPlugin();
