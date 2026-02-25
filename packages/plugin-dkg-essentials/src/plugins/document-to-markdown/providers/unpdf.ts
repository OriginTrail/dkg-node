/**
 * unpdf provider for document-to-markdown conversion.
 * Uses Mozilla pdf.js (via unpdf) to extract text from non-scanned PDFs.
 * Zero-config — no API key required.
 */

import { extractText } from "unpdf";

import type {
  DocumentConversionProvider,
  DocumentConversionOptions,
  DocumentConversionOutput,
} from "../types";
import { getFileExtension, validateFileSize } from "../validation";

const PROVIDER_NAME = "unpdf";

/**
 * unpdf provider for PDF text extraction.
 * Supports .pdf files only — for .docx/.pptx or scanned PDFs, use Mistral.
 */
export class UnpdfProvider implements DocumentConversionProvider {
  readonly name = PROVIDER_NAME;

  async convert(
    buffer: Buffer,
    filename: string,
    options?: DocumentConversionOptions,
  ): Promise<DocumentConversionOutput> {
    // Only PDF is supported — reject other formats with a helpful message
    const ext = getFileExtension(filename);
    if (ext !== ".pdf") {
      throw new Error(
        `The unpdf provider only supports .pdf files, got '${ext || "(no extension)"}'. ` +
          `For .docx and .pptx support, use the Mistral provider ` +
          `(set DOCUMENT_CONVERSION_PROVIDER=mistral and provide MISTRAL_API_KEY).`,
      );
    }

    validateFileSize(buffer.length);

    // Extract text from PDF using pdf.js
    const { totalPages, text } = await extractText(new Uint8Array(buffer), {
      mergePages: false,
    });

    // Clamp page range to valid bounds (1-indexed inputs, 0-indexed array)
    const effectiveStart = Math.min(
      totalPages,
      Math.max(1, options?.pageStart ?? 1),
    );
    const effectiveEnd = Math.min(
      totalPages,
      Math.max(effectiveStart, options?.pageEnd ?? totalPages),
    );

    let pages = text;
    if (options?.pageStart != null || options?.pageEnd != null) {
      pages = text.slice(effectiveStart - 1, effectiveEnd);
    }

    // Format pages with separators
    const markdown = pages
      .map((pageText, i) => {
        const pageNum = effectiveStart + i;
        return `<!-- Page ${pageNum} -->\n\n${pageText}`;
      })
      .join("\n\n");

    return {
      markdown,
      images: [],
      pageCount: totalPages,
    };
  }
}

/**
 * Create an unpdf provider instance. No configuration required.
 */
export function createUnpdfProvider(): UnpdfProvider {
  return new UnpdfProvider();
}
