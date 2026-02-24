/**
 * Document to Markdown MCP Tool
 *
 * Converts PDF, DOCX, and PPTX documents to Markdown using configurable OCR providers.
 * Default provider: unpdf (zero-config PDF text extraction).
 *
 * Environment variables:
 * - DOCUMENT_CONVERSION_PROVIDER (optional, default: "unpdf")
 * - MISTRAL_API_KEY (required when using Mistral provider)
 */

import { Readable } from "stream";
import consumers from "stream/consumers";
import { defineDkgPlugin, DkgContext } from "@dkg/plugins";
import { z } from "@dkg/plugins/helpers";
import { openAPIRoute } from "@dkg/plugin-swagger";
import busboy from "busboy";

import type {
  DocumentConversionProvider,
  DocumentConversionOptions,
  ConversionResult,
  DocumentConversionConfig,
} from "./types";
import { integrateWithBlobStorage } from "./blob-integration";
import { validateFileType, validateFileSize } from "./validation";
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
  UnpdfProvider,
  createUnpdfProvider,
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
 * Validates file type and size, converts via provider, then integrates with blob storage.
 */
async function processDocument(
  ctx: DkgContext,
  provider: DocumentConversionProvider,
  documentBuffer: Buffer,
  filename: string,
  options?: DocumentConversionOptions,
): Promise<ConversionResult> {
  // Validate before handing off to provider (providers may also validate internally)
  validateFileType(filename);
  validateFileSize(documentBuffer.length);

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
  return defineDkgPlugin((ctx, mcp, api) => {
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
        "unpdf";

      provider = createProvider(providerName);
    }

    console.log(
      `Document-to-markdown plugin initialized with provider: ${provider.name}`,
    );

    // REST endpoint for document-to-markdown conversion
    api.post(
      "/document-to-markdown",
      openAPIRoute(
        {
          summary: "Convert document to Markdown",
          description:
            "Upload a PDF, DOCX, or PPTX file and convert it to Markdown. " +
            "Supported document types and image extraction capabilities depend on the configured provider. " +
            "Returns the extracted markdown content and any images stored in blob storage.",
          tag: "Documents",
          response: {
            schema: z.object({
              markdown: z.string().openapi({
                description: "The extracted markdown content",
              }),
              markdownBlobId: z.string().openapi({
                description: "Blob ID of the stored markdown file",
              }),
              outputFolderId: z.string().openapi({
                description: "Blob folder ID containing all conversion outputs",
              }),
              pageCount: z.number().openapi({
                description: "Number of pages processed",
              }),
              images: z.array(
                z.object({
                  id: z.string(),
                  blobId: z.string(),
                }),
              ).openapi({
                description: "List of extracted images with their blob IDs",
              }),
            }),
          },
          finalizeRouteConfig(cfg) {
            cfg.request = {
              body: {
                required: true,
                description:
                  "Document file to convert. Supported formats: PDF, DOCX, PPTX.",
                content: {
                  "multipart/form-data": {
                    schema: z.object({
                      file: z.string().openapi({
                        description: "The document file to convert",
                        format: "binary",
                      }),
                    }),
                  },
                },
              },
            };
            return cfg;
          },
        },
        async (req, res) => {
          let fileReceived = false;

          const bb = busboy({ headers: req.headers });

          bb.on("file", async (_name, file, info) => {
            fileReceived = true;
            try {
              const documentBuffer = await consumers.buffer(
                Readable.toWeb(file),
              );

              const result = await processDocument(
                ctx,
                provider,
                documentBuffer,
                info.filename,
              );

              res.status(200).json({
                markdown: result.markdown,
                markdownBlobId: result.markdownBlobId,
                outputFolderId: result.outputFolderId,
                pageCount: result.pageCount,
                images: result.images.map((img) => ({
                  id: img.id,
                  blobId: img.blobId ?? "",
                })),
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              console.error(
                "Error converting document to markdown:",
                message,
              );
              res.status(400).json({ error: message });
            }
          });

          bb.on("error", (error: Error) => {
            console.error("Error parsing multipart request:", error.message);
            res.status(400).json({ error: "Invalid multipart request." });
          });

          bb.on("close", () => {
            if (!fileReceived) {
              res
                .status(400)
                .json({ error: "No file provided in the request." });
            }
          });

          req.pipe(bb);
        },
      ),
    );

    mcp.registerTool(
      "document-to-markdown",
      {
        title: "Document to Markdown",
        description:
          "Convert PDF, DOCX, or PPTX documents to Markdown. " +
          "Supported document types and image extraction capabilities depend on the configured provider. " +
          "Use this as the first step when publishing documents to the DKG - " +
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
 * Default plugin export - uses unpdf provider (zero-config).
 * For Mistral OCR, use createDocumentToMarkdownPlugin({ providerName: "mistral" }).
 */
export default createDocumentToMarkdownPlugin();
