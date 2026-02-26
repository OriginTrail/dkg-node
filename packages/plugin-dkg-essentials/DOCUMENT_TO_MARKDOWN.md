# Document to Markdown Tool

Convert PDF, DOCX, and PPTX documents to Markdown using configurable conversion providers.

## Overview

The `document-to-markdown` MCP tool extracts text and images from documents and converts them to well-structured Markdown. Extracted images are stored as separate blobs alongside the markdown output.

The tool supports a **provider abstraction** pattern, allowing you to switch between different conversion backends.

## Available Providers

| Provider | Name | Formats | Images | API Key Required |
|----------|------|---------|--------|------------------|
| **unpdf** (default) | `unpdf` | PDF only | No | No |
| **Mistral OCR** | `mistral` | PDF, DOCX, PPTX | Yes | Yes (`MISTRAL_API_KEY`) |

### unpdf (Default)

Zero-config text extraction powered by Mozilla's `pdf.js`. Good for simple PDF text extraction without external API dependencies.

- **Formats**: PDF only
- **Images**: Not supported (returns empty array)
- **Requirements**: None — works out of the box

### Mistral OCR

Full-featured OCR with multi-format support and image extraction. Handles scanned PDFs, complex layouts, and non-PDF formats.

- **Formats**: PDF, DOCX, PPTX
- **Images**: Full extraction support
- **Requirements**: `MISTRAL_API_KEY` ([get one here](https://console.mistral.ai/))
- **Timeout**: 120 seconds per request

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DOCUMENT_CONVERSION_PROVIDER` | No | Provider to use (default: `"unpdf"`) |
| `MISTRAL_API_KEY` | Only for Mistral | Your Mistral API key |

## Supported Formats

| Extension | MIME Type | unpdf | Mistral |
|-----------|-----------|:-----:|:-------:|
| `.pdf` | `application/pdf` | Yes | Yes |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | — | Yes |
| `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | — | Yes |

## Usage

### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `blobId` | string | One of `blobId` or `fileBase64` | ID of a previously uploaded document blob |
| `fileBase64` | string | One of `blobId` or `fileBase64` | Base64-encoded document content |
| `filename` | string | **Yes** | Original filename with extension (e.g., `report.pdf`) |
| `options` | object | No | Conversion options (see below) |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pageStart` | integer | 1 | First page to process (1-indexed, inclusive) |
| `pageEnd` | integer | Last page | Last page to process (1-indexed, inclusive) |
| `includeImages` | boolean | true | Whether to extract and store images |

Page range values are automatically clamped to valid bounds — out-of-range values are silently adjusted.

### Example: Using blob ID

```json
{
  "name": "document-to-markdown",
  "arguments": {
    "blobId": "abc123-def456",
    "filename": "quarterly-report.pdf"
  }
}
```

### Example: Using base64 content

```json
{
  "name": "document-to-markdown",
  "arguments": {
    "fileBase64": "JVBERi0xLjQKJ...",
    "filename": "presentation.pptx",
    "options": {
      "pageStart": 1,
      "pageEnd": 10,
      "includeImages": true
    }
  }
}
```

### REST Endpoint

`POST /document-to-markdown` accepts `multipart/form-data` with a `file` field. The JSON response includes both `pageCount` (total pages) and `processedPageCount` (pages in markdown output).

## Output Structure

### Response Format

The tool returns a text response containing:

1. **Status message** — Success or failure indication
2. **Output folder ID** — UUID of the folder containing all outputs
3. **Markdown blob ID** — ID of the generated markdown file
4. **Total page count** — Number of pages in the source document
5. **Processed page count** — Number of pages included in converted markdown output
6. **Image count** — Number of images extracted (if any)
7. **Markdown content** — The full converted markdown

### File Organization

Outputs are stored in a nested folder structure:

```
document-conversions/
└── {uuid}/
    ├── {original-name}.md    # Converted markdown
    ├── img-0.jpeg            # Extracted image 1
    ├── img-1.jpeg            # Extracted image 2
    └── ...
```

### Image References

Images in the markdown reference their blob URLs:

```markdown
![img-0.jpeg](dkg-blob://abc123-def456-...)
```

### Storage Location

All outputs are stored in blob storage under the `document-conversions/` prefix:

| Backend | Typical Location |
|---------|------------------|
| Filesystem (`createFsBlobStorage`) | `./data/blobs/document-conversions/{uuid}/` |
| In-memory (testing only) | RAM, not persisted |
| Custom implementation | As configured |

## Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `MISTRAL_API_KEY environment variable is not set` | Missing API key (Mistral provider) | Set the `MISTRAL_API_KEY` environment variable |
| `Either 'blobId' or 'fileBase64' must be provided` | No input document | Provide either `blobId` or `fileBase64` |
| `Provide either 'blobId' or 'fileBase64', not both` | Both inputs provided | Use only one input method |
| `Unsupported file type: '.xyz'` | Invalid file extension | Use a supported format for your provider |
| `File size (X MB) exceeds maximum of 50MB` | File too large | Use a smaller file or split the document |
| `Document blob not found: {id}` | Invalid blob ID | Verify the blob ID exists |
| `Mistral OCR request timed out after 120 seconds` | API timeout (Mistral) | The document may be too large or complex; try a smaller file |
| `Document conversion failed: {reason}` | Processing error | Check the error details and retry |

## Limitations

- **Maximum file size**: 50 MB
- **Supported formats**: PDF (all providers), DOCX/PPTX (Mistral only)
- **API timeout**: 2 minutes (Mistral provider)
- **Image extraction**: Mistral provider only

## Provider Configuration

### Selecting a Provider

**Via environment variable:**

```bash
# Use unpdf (default) — no API key needed
export DOCUMENT_CONVERSION_PROVIDER=unpdf

# Use Mistral OCR
export DOCUMENT_CONVERSION_PROVIDER=mistral
export MISTRAL_API_KEY=your-api-key
```

**Via programmatic configuration:**

```typescript
import { createDocumentToMarkdownPlugin, createProvider } from "@dkg/plugin-dkg-essentials";

// Option 1: Use a named provider
const plugin = createDocumentToMarkdownPlugin({
  providerName: "mistral",
});

// Option 2: Provide a custom provider instance
const customProvider = createProvider("mistral", { apiKey: "your-key" });
const plugin = createDocumentToMarkdownPlugin({
  provider: customProvider,
});
```

**Provider resolution order** (first match wins):
1. Custom provider instance via `config.provider`
2. Provider name from `config.providerName`
3. `DOCUMENT_CONVERSION_PROVIDER` environment variable
4. Default: `"unpdf"`

### Implementing a Custom Provider

Implement the `DocumentConversionProvider` interface:

```typescript
import type {
  DocumentConversionProvider,
  DocumentConversionOutput,
  DocumentConversionOptions
} from "@dkg/plugin-dkg-essentials";

class MyCustomProvider implements DocumentConversionProvider {
  readonly name = "my-provider";

  async convert(
    buffer: Buffer,
    filename: string,
    options?: DocumentConversionOptions,
  ): Promise<DocumentConversionOutput> {
    return {
      markdown: "# Converted content",
      images: [],
      pageCount: 1,
      processedPageCount: 1,
    };
  }
}

const plugin = createDocumentToMarkdownPlugin({
  provider: new MyCustomProvider(),
});
```

### Exported Types and Utilities

```typescript
import {
  // Types
  DocumentConversionProvider,
  DocumentConversionOptions,
  DocumentConversionOutput,
  ConversionResult,
  ExtractedImage,
  DocumentConversionConfig,

  // Provider utilities
  createProvider,
  getDefaultProvider,
  getAvailableProviders,
  isProviderAvailable,

  // Provider-specific
  MistralProvider,
  createMistralProvider,
} from "@dkg/plugin-dkg-essentials";
```

## Security

- API keys are validated at runtime and never logged
- Temporary files are cleaned up after processing
- Blob storage is used for all file operations

## Related Tools

- `upload` — Upload documents to blob storage before conversion
- `dkg-create` — Create Knowledge Assets from converted content
