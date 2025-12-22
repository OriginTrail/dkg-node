import path from "path";
import { Database } from "../database";
import { assets } from "../database/schema";
import { eq, and, sql } from "drizzle-orm";
import { publishingLogger as logger } from "./Logger";
import { DkgService } from "./DkgService";

export interface PublishResult {
  success: boolean;
  ual?: string;
  transactionHash?: string;
  error?: string;
}

export class PublishingService {
  private dkgService: DkgService;

  constructor(
    private db: Database,
    dkgService?: DkgService,
  ) {
    this.dkgService = dkgService || new DkgService();
  }

  /**
   * Publish an asset to DKG
   */
  async publishAsset(assetId: number, wallet: any): Promise<PublishResult> {
    try {
      // Get asset details
      const assetResult = await this.db
        .select()
        .from(assets)
        .where(eq(assets.id, assetId))
        .limit(1);

      if (!assetResult.length) {
        throw new Error(`Asset ${assetId} not found`);
      }

      const asset = assetResult[0];

      // Check if already published (idempotency check)
      if (asset.status === "published" && asset.ual) {
        console.log(
          `✅ Asset ${assetId} already published with UAL: ${asset.ual}`,
        );
        return {
          success: true,
          ual: asset.ual,
          transactionHash: asset.transactionHash,
        };
      }

      // Update asset status to publishing (attempt count incremented elsewhere)
      const updateResult = await this.db
        .update(assets)
        .set({
          status: "publishing",
          publishingStartedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(assets.id, assetId),
            sql`status IN ('assigned', 'queued', 'failed')`, // Only transition from these states
          ),
        );

      if ((updateResult[0].affectedRows || 0) === 0) {
        throw new Error(
          `Asset ${assetId} is in invalid state for publishing: ${asset.status}`,
        );
      }

      // attemptId is now passed in from the worker - no need to create attempt record here

      // Try to read content directly from filesystem first, fallback to HTTP
      console.log(`🔄 Loading content from: ${asset.contentUrl}`);
      let content: any;

      try {
        // Extract filename from URL
        const urlPath = new URL(asset.contentUrl).pathname;
        const filename = urlPath.split("/").pop();

        if (filename && asset.contentUrl.includes("/storage/")) {
          // Try direct filesystem access
          const storagePath =
            process.env.STORAGE_PATH ||
            path.resolve(__dirname, "../../storage");
          const filePath = require("path").resolve(storagePath, filename);
          console.log(`🔄 Trying direct file access: ${filePath}`);

          const fs = require("fs").promises;
          const fileContent = await fs.readFile(filePath, "utf8");
          content = JSON.parse(fileContent);
          console.log(`✅ Content loaded from filesystem`);
        } else {
          throw new Error("Not a storage URL");
        }
      } catch (fsError: any) {
        console.log(
          `⚠️ Filesystem access failed: ${fsError.message}, trying HTTP...`,
        );

        // Fallback to HTTP fetch
        const response = await fetch(asset.contentUrl);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch content: ${response.status} ${response.statusText}`,
          );
        }

        content = await response.json();
        console.log(`✅ Content fetched via HTTP`);
      }

      // Wrap content based on privacy
      const wrappedContent = {
        [asset.privacy || "private"]: content,
      };

      // Create phased DKG client for this wallet
      const phasedClient = this.dkgService.createWalletPhasedClient(wallet);

      // Publish to DKG (publish phase)
      logger.info(`🚀 Publishing (phase 1) to DKG`, {
        assetId,
        epochs: asset.epochs,
        replications: asset.replications || 1,
        contentSize: JSON.stringify(wrappedContent).length,
        privacy: asset.privacy,
      });

      const publishResult = await phasedClient.publishPhase(wrappedContent, {
        epochsNum: asset.epochs,
        minimumNumberOfFinalizationConfirmations: 3,
        minimumNumberOfNodeReplications: asset.replications || 1,
      });

      if (!publishResult?.readyForMint) {
        throw new Error(
          `Publish phase did not complete (operationId=${publishResult?.publishOperationId})`,
        );
      }

      // Mint phase
      const mintResult = await phasedClient.mintPhase(publishResult);

      if (!mintResult?.UAL) {
        throw new Error("Mint phase did not return a UAL");
      }

      logger.info(`✅ DKG mint SUCCESS WITH UAL for asset ${assetId}`, {
        assetId,
        ual: mintResult.UAL,
        transactionHash:
          mintResult.mintKnowledgeCollectionReceipt?.transactionHash,
      });

      // Update asset: mint submitted, store tx/hash/ual, keep publishedAt null
      await this.db
        .update(assets)
        .set({
          status: "mint_submitted",
          ual: mintResult.UAL,
          transactionHash:
            mintResult.mintKnowledgeCollectionReceipt?.transactionHash || null,
          blockchain: wallet.blockchain,
          publishingStartedAt: sql`NOW()`,
        })
        .where(eq(assets.id, assetId));

      return {
        success: true,
        ual: mintResult.UAL,
        transactionHash:
          mintResult.mintKnowledgeCollectionReceipt?.transactionHash,
      };
    } catch (error: any) {
      console.error(`Publishing failed for asset ${assetId}:`, error);

      // Update asset status to failed
      await this.db
        .update(assets)
        .set({
          status: "failed",
          lastError: error.message,
        })
        .where(eq(assets.id, assetId));

      // Attempt record updating is handled by the worker

      return {
        success: false,
        error: error.message,
      };
    }
  }
}
