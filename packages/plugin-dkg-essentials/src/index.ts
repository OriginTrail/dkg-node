import { defineDkgPlugin } from "@dkg/plugins";

import blobsPlugin from "./plugins/blobs";
import dkgToolsPlugin from "./plugins/dkg-tools";
import documentToMarkdownPlugin, {
  createDocumentToMarkdownPlugin,
} from "./plugins/document-to-markdown";

// Re-export individual plugins
export { dkgToolsPlugin, blobsPlugin, documentToMarkdownPlugin };

// Re-export the factory for custom configuration
export { createDocumentToMarkdownPlugin };

// Re-export types and utilities from document-to-markdown
export type {
  DocumentConversionProvider,
  DocumentConversionOptions,
  DocumentConversionOutput,
  ConversionResult,
  ExtractedImage,
  DocumentConversionConfig,
} from "./plugins/document-to-markdown";

export {
  createProvider,
  getDefaultProvider,
  getAvailableProviders,
  isProviderAvailable,
  MistralProvider,
  createMistralProvider,
} from "./plugins/document-to-markdown";

export default defineDkgPlugin((ctx, mcp, api) => {
  blobsPlugin(ctx, mcp, api);
  dkgToolsPlugin(ctx, mcp, api);
  documentToMarkdownPlugin(ctx, mcp, api);
});
