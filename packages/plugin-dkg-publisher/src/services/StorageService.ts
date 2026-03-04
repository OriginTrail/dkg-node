import { promises as fsPromises } from "fs";
import path from "path";
import CryptoJS from "crypto-js";

export class StorageService {
  private storagePath: string;
  private baseUrl: string;

  constructor() {
    this.storagePath =
      process.env.STORAGE_PATH || path.resolve(process.cwd(), "data/publisher");
    const baseUrl =
      process.env.EXPO_PUBLIC_MCP_URL ||
      `http://localhost:${process.env.PORT || "9200"}`;
    this.baseUrl =
      process.env.STORAGE_BASE_URL ||
      new URL("/storage", baseUrl).toString().replace(/\/$/, "");
    console.log(`📁 StorageService initialized:`);
    console.log(`   - storagePath: ${this.storagePath}`);
    console.log(`   - resolved path: ${path.resolve(this.storagePath)}`);
    console.log(`   - baseUrl: ${this.baseUrl}`);
  }

  /**
   * Save content as a file and return the URL
   */
  async saveContent(
    content: object | string,
  ): Promise<{ url: string; size: number }> {
    try {
      // Convert content to JSON string
      const contentString =
        typeof content === "string"
          ? content
          : JSON.stringify(content, null, 2);

      // Generate unique filename
      const timestamp = Date.now();
      const randomId = CryptoJS.lib.WordArray.random(16).toString();
      const filename = `asset-${timestamp}-${randomId}.json`;

      // Ensure storage directory exists
      const fullStoragePath = path.resolve(this.storagePath);
      await fsPromises.mkdir(fullStoragePath, { recursive: true });
      console.log(`📁 Storage directory: ${fullStoragePath}`);

      // Write file
      const filePath = path.join(fullStoragePath, filename);
      await fsPromises.writeFile(filePath, contentString, "utf8");
      console.log(`✅ Saved file: ${filePath}`);

      // Generate URL
      const fileUrl = `${this.baseUrl}/${filename}`;
      console.log(`🔗 Generated URL: ${fileUrl}`);

      return {
        url: fileUrl,
        size: Buffer.byteLength(contentString, "utf8"),
      };
    } catch (error: any) {
      throw new Error(`Failed to save content as file: ${error.message}`);
    }
  }

  /**
   * Load content from a file URL
   */
  async loadContent(url: string): Promise<any> {
    try {
      // Extract filename from URL
      const filename = url.split("/").pop();
      if (!filename) {
        throw new Error("Invalid URL");
      }

      const filePath = path.join(path.resolve(this.storagePath), filename);
      const content = await fsPromises.readFile(filePath, "utf8");
      return JSON.parse(content);
    } catch (error: any) {
      throw new Error(`Failed to load content from file: ${error.message}`);
    }
  }

  /**
   * Delete a stored file
   */
  async deleteContent(url: string): Promise<void> {
    try {
      const filename = url.split("/").pop();
      if (!filename) {
        throw new Error("Invalid URL");
      }

      const filePath = path.join(path.resolve(this.storagePath), filename);
      await fsPromises.unlink(filePath);
    } catch (error: any) {
      // Ignore file not found errors
      if (error.code !== "ENOENT") {
        throw new Error(`Failed to delete content: ${error.message}`);
      }
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{ totalFiles: number; totalSize: number }> {
    try {
      const fullStoragePath = path.resolve(this.storagePath);
      const files = await fsPromises.readdir(fullStoragePath);

      let totalSize = 0;
      for (const file of files) {
        if (file.endsWith(".json")) {
          const filePath = path.join(fullStoragePath, file);
          const stats = await fsPromises.stat(filePath);
          totalSize += stats.size;
        }
      }

      return {
        totalFiles: files.filter((f) => f.endsWith(".json")).length,
        totalSize,
      };
    } catch (error: any) {
      return { totalFiles: 0, totalSize: 0 };
    }
  }
}
