/**
 * Blob storage integration for document conversion.
 * Handles uploading converted content and images to blob storage.
 */

import { Readable } from "stream";
import { randomUUID } from "crypto";
import type { DkgContext } from "@dkg/plugins";
import type {
  ExtractedImage,
  DocumentConversionOutput,
  ConversionResult,
} from "./types";
import { getBasename, sanitizePathComponent } from "./validation";

const BLOB_PREFIX = "document-conversions";

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace image filename references in markdown with blob URLs.
 * Transforms: ![img-0.jpeg](img-0.jpeg) -> ![img-0.jpeg](dkg-blob://uuid)
 */
export function replaceImageRefsWithBlobUrls(
  markdown: string,
  images: ExtractedImage[],
): string {
  let result = markdown;
  for (const image of images) {
    if (image.blobId) {
      // Replace both the src and keep the original filename in alt
      // Pattern: ![anything](img-0.jpeg) or ![](img-0.jpeg)
      const pattern = new RegExp(
        `(!\\[[^\\]]*\\])\\(${escapeRegExp(image.id)}\\)`,
        "g",
      );
      result = result.replace(pattern, `$1(dkg-blob://${image.blobId})`);
    }
  }
  return result;
}

/**
 * Upload images to blob storage and update their blobId references.
 * Mutates the images array in place.
 */
async function uploadImages(
  ctx: DkgContext,
  images: ExtractedImage[],
  folderId: string,
): Promise<void> {
  for (const image of images) {
    const safeImageId = sanitizePathComponent(image.id);
    const imageBlobId = `${BLOB_PREFIX}/${folderId}/${safeImageId}`;
    const imageStream = Readable.toWeb(Readable.from(image.data));
    await ctx.blob.put(imageBlobId, imageStream, {
      name: safeImageId,
      mimeType: `image/${image.originalFormat}`,
    });
    image.blobId = imageBlobId;
    console.log(`Uploaded image ${image.id} as blob: ${imageBlobId}`);
  }
}

/**
 * Upload markdown content to blob storage.
 */
async function uploadMarkdown(
  ctx: DkgContext,
  markdown: string,
  filename: string,
  folderId: string,
): Promise<string> {
  const safeFilename = sanitizePathComponent(filename);
  const baseName = getBasename(safeFilename);
  const markdownFilename = `${baseName}.md`;
  const markdownBlobId = `${BLOB_PREFIX}/${folderId}/${markdownFilename}`;
  const markdownBuffer = Buffer.from(markdown, "utf-8");
  const markdownStream = Readable.toWeb(Readable.from(markdownBuffer));

  await ctx.blob.put(markdownBlobId, markdownStream, {
    name: markdownFilename,
    mimeType: "text/markdown",
  });

  console.log(`Uploaded markdown as blob: ${markdownBlobId}`);
  return markdownBlobId;
}

/**
 * Integrate conversion output with blob storage.
 * Uploads images and markdown, returns final result with blob IDs.
 */
export async function integrateWithBlobStorage(
  ctx: DkgContext,
  output: DocumentConversionOutput,
  filename: string,
): Promise<ConversionResult> {
  // Create output folder with UUID
  const folderId = randomUUID();

  // Upload extracted images
  await uploadImages(ctx, output.images, folderId);

  // Replace image refs in markdown
  let finalMarkdown = output.markdown;
  if (output.images.length > 0) {
    finalMarkdown = replaceImageRefsWithBlobUrls(finalMarkdown, output.images);
  }

  // Upload markdown
  const markdownBlobId = await uploadMarkdown(
    ctx,
    finalMarkdown,
    filename,
    folderId,
  );

  return {
    markdown: finalMarkdown,
    images: output.images,
    pageCount: output.pageCount,
    outputFolderId: folderId,
    markdownBlobId,
  };
}
