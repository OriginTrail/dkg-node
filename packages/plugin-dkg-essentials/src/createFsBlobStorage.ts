// Works only in node.js!
import fs from "fs";
import path from "path";
import { Readable, Writable } from "stream";
import { BlobStorage } from "@dkg/plugins/types";
import { createBlobStorage } from "@dkg/plugins/helpers";

const createFsBlobStorage = (blobsDirectory: string): BlobStorage => {
  const resolvedBlobsDirectory = path.resolve(blobsDirectory);

  const resolveBlobPath = (id: string): string => {
    if (!id) {
      throw new Error("Invalid blob ID: empty ID is not allowed.");
    }

    const resolvedBlobPath = path.resolve(resolvedBlobsDirectory, id);
    const relativePath = path.relative(
      resolvedBlobsDirectory,
      resolvedBlobPath,
    );

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error(`Invalid blob ID path: '${id}'.`);
    }

    return resolvedBlobPath;
  };

  try {
    fs.mkdirSync(resolvedBlobsDirectory, { recursive: true });
  } catch (error) {
    console.log(error);
  }

  return createBlobStorage({
    info: (id) => {
      try {
        const filePath = resolveBlobPath(id);
        return fs.promises
          .stat(filePath)
          .then((stats) => ({
            size: stats.size,
            lastModified: stats.mtime,
          }))
          .catch(() => null);
      } catch {
        return Promise.resolve(null);
      }
    },
    put: async (id, content /* , _metadata */) => {
      const filePath = resolveBlobPath(id);
      // Ensure parent directories exist for nested paths
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const blobStream = Writable.toWeb(fs.createWriteStream(filePath));
      return content.pipeTo(blobStream);
    },
    get: async (id) => {
      const filePath = resolveBlobPath(id);
      return Readable.toWeb(fs.createReadStream(filePath));
    },
    delete: (id) => {
      const filePath = resolveBlobPath(id);
      return fs.promises.unlink(filePath);
    },
  });
};

export default createFsBlobStorage;
