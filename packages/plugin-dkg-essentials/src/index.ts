import { defineDkgPlugin } from "@dkg/plugins";

import blobsPlugin from "./plugins/blobs";
import dkgToolsPlugin from "./plugins/dkg-tools";
import documentToMarkdownPlugin from "./plugins/document-to-markdown";

export { dkgToolsPlugin, blobsPlugin, documentToMarkdownPlugin };

export default defineDkgPlugin((ctx, mcp, api) => {
  blobsPlugin(ctx, mcp, api);
  dkgToolsPlugin(ctx, mcp, api);
  documentToMarkdownPlugin(ctx, mcp, api);
});
