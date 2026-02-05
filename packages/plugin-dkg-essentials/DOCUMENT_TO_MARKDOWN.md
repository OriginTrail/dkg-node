# Document to Markdown Tool

Convert PDF, DOCX, and PPTX documents to Markdown using configurable OCR providers.

## Overview

The `document-to-markdown` MCP tool uses OCR (Optical Character Recognition) to extract text and images from documents and convert them to well-structured Markdown format. Extracted images are stored as separate blobs alongside the markdown output.

The tool supports a **provider abstraction** pattern, allowing you to switch between different OCR backends. The default provider is **Mistral OCR**.

## Requirements

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MISTRAL_API_KEY` | **Yes** (for Mistral provider) | Your Mistral API key for OCR processing |
| `DOCUMENT_CONVERSION_PROVIDER` | No | Provider name to use (default: `"mistral"`) |

Get your Mistral API key from [Mistral AI Console](https://console.mistral.ai/).

## Supported Formats

| Extension | MIME Type | Description |
|-----------|-----------|-------------|
| `.pdf` | `application/pdf` | PDF documents |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Microsoft Word documents |
| `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | Microsoft PowerPoint presentations |

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
| `pageStart` | number | 1 | First page to process (1-indexed) |
| `pageEnd` | number | Last page | Last page to process (inclusive) |
| `includeImages` | boolean | true | Whether to extract and store images |

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

## Output Structure

### Response Format

The tool returns a text response containing:

1. **Status message** - Success or failure indication
2. **Output folder ID** - UUID of the folder containing all outputs
3. **Markdown blob ID** - ID of the generated markdown file
4. **Page count** - Number of pages processed
5. **Image count** - Number of images extracted (if any)
6. **Markdown content** - The full converted markdown

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

- **Folder ID**: Generated UUID to group related files
- **Markdown file**: Named after the original document (e.g., `report.md`)
- **Images**: Named by Mistral (e.g., `img-0.jpeg`, `img-1.jpeg`), format preserved

### Image References

Images in the markdown reference their blob URLs:

```markdown
![img-0.jpeg](dkg-blob://abc123-def456-...)
```

### Storage Location

All outputs (markdown files and extracted images) are stored in the DKG node's configured blob storage under the `document-conversions/` prefix for organized grouping. The physical location depends on your blob storage backend:

| Backend | Typical Location |
|---------|------------------|
| Filesystem (`createFsBlobStorage`) | `./data/blobs/document-conversions/{uuid}/` |
| In-memory (testing only) | RAM, not persisted |
| Custom implementation | As configured |

Files are organized in nested folders:
- `document-conversions/{uuid}/{original-name}.md` — The converted markdown
- `document-conversions/{uuid}/img-0.jpeg` — Extracted images (named by Mistral)

## Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `MISTRAL_API_KEY environment variable is not set` | Missing API key | Set the `MISTRAL_API_KEY` environment variable |
| `Either 'blobId' or 'fileBase64' must be provided` | No input document | Provide either `blobId` or `fileBase64` |
| `Provide either 'blobId' or 'fileBase64', not both` | Both inputs provided | Use only one input method |
| `Unsupported file type: '.xyz'` | Invalid file extension | Use PDF, DOCX, or PPTX files |
| `File size (X MB) exceeds maximum of 50MB` | File too large | Use a smaller file or split the document |
| `Document blob not found: {id}` | Invalid blob ID | Verify the blob ID exists |
| `Mistral OCR request timed out after 120 seconds` | API timeout | The document may be too large or complex; try a smaller file |
| `Document conversion failed: {reason}` | OCR processing error | Check the error details and retry |

## Limitations

- **Maximum file size**: 50 MB
- **Supported formats**: PDF, DOCX, PPTX only
- **API timeout**: 2 minutes (120 seconds)
- **API dependency**: Requires active OCR provider API connection
- **Processing time**: Large documents may take longer to process

## Provider Abstraction

The tool uses a provider abstraction pattern that allows swapping OCR backends without changing consuming code.

### Available Providers

| Provider | Name | Environment Variables |
|----------|------|----------------------|
| Mistral OCR | `mistral` | `MISTRAL_API_KEY` |

### Selecting a Provider

**Via environment variable:**

```bash
# Use Mistral (default)
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

### Exported Types and Utilities

The package exports types and utilities for working with providers:

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

  // Mistral-specific
  MistralProvider,
  createMistralProvider,
} from "@dkg/plugin-dkg-essentials";
```

### Implementing a Custom Provider

To add a new OCR provider, implement the `DocumentConversionProvider` interface:

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
    // Your OCR implementation here
    return {
      markdown: "# Converted content",
      images: [],
      pageCount: 1,
    };
  }
}

// Use with the plugin
const plugin = createDocumentToMarkdownPlugin({
  provider: new MyCustomProvider(),
});
```

## Security

- API keys are validated at runtime and never logged
- Temporary files are cleaned up after processing
- Blob storage is used for all file operations

## Related Tools

- `upload` - Upload documents to blob storage before conversion
- `dkg-create` - Create Knowledge Assets from converted content
