import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import consumers from "stream/consumers";
import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";

import createFsBlobStorage from "../dist/createFsBlobStorage.js";

describe("@dkg/plugin-dkg-essentials createFsBlobStorage", () => {
  let tempRootDir: string;

  beforeEach(() => {
    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dkg-fs-blobs-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tempRootDir, { recursive: true, force: true });
  });

  it("should allow writes inside blob root and read content back", async () => {
    const blobsDir = path.join(tempRootDir, "blobs");
    const storage = createFsBlobStorage(blobsDir);
    const input = Buffer.from("hello blob storage");

    await storage.put(
      "nested/path/test.txt",
      Readable.toWeb(Readable.from(input)),
      {},
    );

    const blob = await storage.get("nested/path/test.txt");
    expect(blob).to.not.equal(null);

    const output = await consumers.buffer(blob!.data);
    expect(output.toString()).to.equal("hello blob storage");
  });

  it("should block path traversal on put and not write outside blob root", async () => {
    const blobsDir = path.join(tempRootDir, "blobs");
    const storage = createFsBlobStorage(blobsDir);
    const outsidePath = path.join(tempRootDir, "outside.txt");

    try {
      await storage.put(
        "../outside.txt",
        Readable.toWeb(Readable.from(Buffer.from("attack"))),
        {},
      );
      expect.fail("Expected path traversal put to throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).to.include("Invalid blob ID path");
    }

    expect(fs.existsSync(outsidePath)).to.equal(false);
  });

  it("should return null from info for traversal IDs", async () => {
    const blobsDir = path.join(tempRootDir, "blobs");
    const storage = createFsBlobStorage(blobsDir);

    const info = await storage.info("../outside.txt");
    expect(info).to.equal(null);
  });

  it("should block traversal on delete", async () => {
    const blobsDir = path.join(tempRootDir, "blobs");
    const storage = createFsBlobStorage(blobsDir);

    try {
      await storage.delete("../outside.txt");
      expect.fail("Expected path traversal delete to throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).to.include("Invalid blob ID path");
    }
  });
});
