/**
 * unpdf provider for document-to-markdown conversion.
 * Uses Mozilla pdf.js (via unpdf) to extract text from non-scanned PDFs.
 * Zero-config - no API key required.
 */

import { extractText } from "unpdf";

import type {
  DocumentConversionProvider,
  DocumentConversionOptions,
  DocumentConversionOutput,
} from "../types";
import { normalizePageRange } from "../page-range";
import { getFileExtension, validateFileSize } from "../validation";

const PROVIDER_NAME = "unpdf";

/**
 * unpdf provider for PDF text extraction.
 * Supports .pdf files only - for .docx/.pptx or scanned PDFs, use Mistral.
 */
export class UnpdfProvider implements DocumentConversionProvider {
  readonly name = PROVIDER_NAME;

  async convert(
    buffer: Buffer,
    filename: string,
    options?: DocumentConversionOptions,
  ): Promise<DocumentConversionOutput> {
    type InternalDocumentConversionOptions = DocumentConversionOptions & {
      __skipBaseValidation?: boolean;
    };
    const internalOptions = options as InternalDocumentConversionOptions | undefined;

    // Only PDF is supported - reject other formats with a helpful message
    const ext = getFileExtension(filename);
    if (ext !== ".pdf") {
      throw new Error(
        `The unpdf provider only supports .pdf files, got '${ext || "(no extension)"}'. ` +
          `For .docx and .pptx support, use the Mistral provider ` +
          `(set DOCUMENT_CONVERSION_PROVIDER=mistral and provide MISTRAL_API_KEY).`,
      );
    }

    if (!internalOptions?.__skipBaseValidation) {
      validateFileSize(buffer.length);
    }

    // Extract text from PDF using pdf.js
    const { totalPages, text } = await extractText(new Uint8Array(buffer), {
      mergePages: false,
    });

    const { startPage, endPage, hasPageFilter } = normalizePageRange(
      totalPages,
      options,
    );

    let pages = text;
    if (hasPageFilter) {
      pages = text.slice(startPage - 1, endPage);
    }

    // Format pages with separators
    const markdown = pages
      .map((pageText, i) => {
        const pageNum = startPage + i;
        return `<!-- Page ${pageNum} -->\n\n${pageText}`;
      })
      .join("\n\n");

    return {
      markdown,
      images: [],
      pageCount: totalPages,
      processedPageCount: pages.length,
    };
  }
}

/**
 * Create an unpdf provider instance. No configuration required.
 */
export function createUnpdfProvider(): UnpdfProvider {
  return new UnpdfProvider();
}
