import path from "path";
import { Database } from "../database";
import { assets } from "../database/schema";
import { eq, and, sql } from "drizzle-orm";
import { publishingLogger as logger } from "./Logger";
import { DkgService } from "./DkgService";
import { serializeErrorDetails } from "./errorUtils";

export interface PublishResult {
  success: boolean;
  ual?: string;
  transactionHash?: string;
  error?: string;
  errorDetails?: Record<string, unknown>;
}

export class PublishingService {
  private dkgService: DkgService;

  constructor(private db: Database, dkgService: DkgService) {
    this.dkgService = dkgService;
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
            path.resolve(process.cwd(), "data/publisher");
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

      // Create DKG client for this wallet
      const dkgClient = this.dkgService.createWalletDKGClient(wallet);

      // Publish to DKG
      console.log(`🚀 Publishing to DKG:`, {
        assetId,
        epochs: asset.epochs,
        replications: asset.replications || 1,
        contentSize: JSON.stringify(wrappedContent).length,
        privacy: asset.privacy,
      });

      console.log(`📡 Making DKG API call...`);

      const result = await dkgClient.asset.create(wrappedContent, {
        epochsNum: asset.epochs,
        minimumNumberOfFinalizationConfirmations: 3,
        minimumNumberOfNodeReplications: asset.replications || 1,
      });

      // Log the complete DKG asset.create result
      logger.info(`📡 DKG asset.create RESULT for asset ${assetId}`, {
        assetId,
        result: JSON.stringify(result, null, 2),
      });

      // Check for DKG API errors first
      if (
        result?.operation?.publish?.errorType ||
        result?.operation?.publish?.errorMessage
      ) {
        const errorType = result.operation.publish.errorType;
        const errorMessage = result.operation.publish.errorMessage;

        logger.error(`❌ DKG API ERROR for asset ${assetId}`, {
          assetId,
          errorType,
          errorMessage,
          operationId: result.operation.publish.operationId,
          status: result.operation.publish.status,
        });

        const err = new Error(`DKG API Error: ${errorType} - ${errorMessage}`);
        (err as any).operationId = result.operation.publish.operationId;
        (err as any).operationStatus = result.operation.publish.status;
        (err as any).dkgOperation = result.operation.publish;
        throw err;
      }

      // ONLY update as published if we actually have a UAL
      if (!result.UAL) {
        logger.error(`❌ DKG API SUCCESS BUT NO UAL for asset ${assetId}`, {
          assetId,
          resultStructure: result ? Object.keys(result) : "null",
          resultJson: JSON.stringify(result),
          UALValue: result?.UAL,
          UALType: typeof result?.UAL,
        });
        throw new Error("DKG API returned success but no UAL was provided");
      }

      logger.info(`✅ DKG API SUCCESS WITH UAL for asset ${assetId}`, {
        assetId,
        ual: result.UAL,
        transactionHash:
          result.operation?.mintKnowledgeCollection?.transactionHash,
      });

      // Update asset with success
      await this.db
        .update(assets)
        .set({
          status: "published",
          ual: result.UAL,
          transactionHash:
            result.operation?.mintKnowledgeCollection?.transactionHash || null,
          blockchain: wallet.blockchain,
          publishedAt: sql`NOW()`,
        })
        .where(eq(assets.id, assetId));

      // Attempt record updating is handled by the worker

      return {
        success: true,
        ual: result.UAL,
        transactionHash:
          result.operation?.mintKnowledgeCollection?.transactionHash,
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
        errorDetails: serializeErrorDetails(error),
      };
    }
  }
}
