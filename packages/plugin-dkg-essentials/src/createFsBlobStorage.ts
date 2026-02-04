// Works only in node.js!
import fs from "fs";
import path from "path";
import { Readable, Writable } from "stream";
import { BlobStorage } from "@dkg/plugins/types";
import { createBlobStorage } from "@dkg/plugins/helpers";

const createFsBlobStorage = (blobsDirectory: string): BlobStorage => {
  try {
    fs.mkdirSync(blobsDirectory, { recursive: true });
  } catch (error) {
    console.log(error);
  }

  return createBlobStorage({
    info: (id) =>
      fs.promises
        .stat(path.join(blobsDirectory, id))
        .then((stats) => ({
          size: stats.size,
          lastModified: stats.mtime,
        }))
        .catch(() => null),
    put: async (id, content /* , _metadata */) => {
      const filePath = path.join(blobsDirectory, id);
      // Ensure parent directories exist for nested paths
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const blobStream = Writable.toWeb(fs.createWriteStream(filePath));
      return content.pipeTo(blobStream);
    },
    get: async (id) =>
      Readable.toWeb(fs.createReadStream(path.join(blobsDirectory, id))),
    delete: (id) => fs.promises.unlink(path.join(blobsDirectory, id)),
  });
};

export default createFsBlobStorage;
