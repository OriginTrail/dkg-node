import { EventEmitter } from "events";
import { Database } from "../database";
import { assets, publishingAttempts } from "../database/schema";
import { eq, and, sql, desc, or } from "drizzle-orm";
import { AssetInput, AssetStatus } from "../types";
import { StorageService } from "./StorageService";

export class AssetService extends EventEmitter {
  constructor(
    private db: Database,
    private storageService: StorageService,
  ) {
    super();
  }

  /**
   * Register an asset for publishing
   */
  async registerAsset(input: AssetInput): Promise<AssetStatus> {
    // Save content as file
    const { url: contentUrl, size: contentSize } =
      await this.storageService.saveContent(input.content);

    // Store asset in database
    const result = await this.db.insert(assets).values({
      contentUrl,
      contentSize,
      source: input.metadata?.source || null,
      sourceId: input.metadata?.sourceId || null,
      priority: input.publishOptions?.priority || 50,
      status: "queued",
      queuedAt: sql`NOW()`,
      privacy: input.publishOptions?.privacy || "private",
      epochs: input.publishOptions?.epochs || 2,
      maxAttempts: input.publishOptions?.maxAttempts || 3,
      retryCount: 0,
    });

    const assetId = result[0].insertId;

    const assetStatus: AssetStatus = {
      id: assetId,
      status: "queued",
      attemptCount: 0,
      ual: null,
      transactionHash: null,
      publishedAt: null,
      lastError: null,
    };

    // No events - just register and return. Poller will handle processing.
    console.log(`✅ Asset ${assetId} registered and queued for processing`);

    return assetStatus;
  }

  /**
   * Get asset by ID
   */
  async getAsset(id: number): Promise<AssetStatus | null> {
    const result = await this.db
      .select()
      .from(assets)
      .where(eq(assets.id, id))
      .limit(1);

    if (!result.length) {
      return null;
    }

    const asset = result[0];
    return {
      id: asset.id,
      status: asset.status,
      ual: asset.ual,
      transactionHash: asset.transactionHash,
      publishedAt: asset.publishedAt,
      attemptCount: asset.attemptCount || 0,
      lastError: asset.lastError,
      metadata: { source: asset.source, sourceId: asset.sourceId },
    };
  }

  /**
   * Update asset status
   */
  async updateAssetStatus(
    id: number,
    status:
      | "pending"
      | "queued"
      | "assigned"
      | "publishing"
      | "mint_submitted"
      | "published"
      | "failed",
    additionalFields?: Partial<{
      walletId: number | null;
      ual: string;
      transactionHash: string;
      blockchain: string;
      lastError: string;
      attemptCount: number;
      assignedAt: Date | null;
      publishingStartedAt: Date | null;
    }>,
  ): Promise<void> {
    const updates: any = { status };

    // Add timestamp based on status
    switch (status) {
      case "queued":
        updates.queuedAt = sql`NOW()`;
        break;
      case "assigned":
        updates.assignedAt = sql`NOW()`;
        break;
      case "publishing":
        updates.publishingStartedAt = sql`NOW()`;
        break;
      case "mint_submitted":
        updates.publishingStartedAt = updates.publishingStartedAt || sql`NOW()`;
        break;
      case "published":
        updates.publishedAt = sql`NOW()`;
        break;
    }

    // Merge additional fields
    if (additionalFields) {
      Object.assign(updates, additionalFields);
    }

    await this.db.update(assets).set(updates).where(eq(assets.id, id));
  }

  /**
   * Get assets by source
   */
  async getAssetsBySource(
    source: string,
    options?: {
      status?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<AssetStatus[]> {
    let whereClause = eq(assets.source, source);

    if (options?.status) {
      whereClause = and(
        eq(assets.source, source),
        eq(assets.status, options.status as any),
      );
    }

    const baseQuery = this.db
      .select()
      .from(assets)
      .where(whereClause)
      .orderBy(desc(assets.createdAt));

    const results = options?.limit
      ? options.offset
        ? await baseQuery.limit(options.limit).offset(options.offset)
        : await baseQuery.limit(options.limit)
      : await baseQuery;

    return results.map((asset) => ({
      id: asset.id,
      status: asset.status,
      ual: asset.ual,
      transactionHash: asset.transactionHash,
      publishedAt: asset.publishedAt,
      attemptCount: asset.attemptCount || 0,
      lastError: asset.lastError,
      metadata: { source: asset.source, sourceId: asset.sourceId },
    }));
  }

  /**
   * Get pending assets for assignment
   */
  async getPendingAssets(limit: number = 10): Promise<any[]> {
    return await this.db
      .select()
      .from(assets)
      .where(eq(assets.status, "queued"))
      .orderBy(desc(assets.priority), assets.queuedAt)
      .limit(limit);
  }

  /**
   * Mark asset as assigned (added to BullMQ queue)
   */
  async markAssetAssigned(assetId: number): Promise<boolean> {
    const result = await this.db
      .update(assets)
      .set({
        status: "assigned",
        assignedAt: sql`NOW()`,
      })
      .where(and(eq(assets.id, assetId), eq(assets.status, "queued")));

    return (result[0].affectedRows || 0) > 0;
  }

  /**
   * Assign wallet to asset atomically
   */
  async assignWalletToAsset(
    assetId: number,
    walletId: number,
  ): Promise<boolean> {
    const result = await this.db
      .update(assets)
      .set({
        walletId,
        status: "assigned",
        assignedAt: sql`NOW()`,
      })
      .where(and(eq(assets.id, assetId), eq(assets.status, "queued")));

    return (result[0].affectedRows || 0) > 0;
  }

  /**
   * Atomically claim an asset for processing (prevents duplicate processing)
   */
  async claimAssetForProcessing(assetId: number): Promise<boolean> {
    // Check current retry count and max attempts
    const asset = await this.db
      .select()
      .from(assets)
      .where(eq(assets.id, assetId))
      .limit(1);

    if (!asset.length) {
      console.log(`❌ Asset ${assetId} not found`);
      return false;
    }

    const currentAsset = asset[0];
    const maxRetries = currentAsset.maxAttempts || 3;
    const currentRetries = currentAsset.retryCount || 0;

    // Check if asset has exceeded retry limit
    if (currentRetries >= maxRetries) {
      console.log(
        `❌ Asset ${assetId} has exceeded max retries (${currentRetries}/${maxRetries})`,
      );

      // Mark as permanently failed
      await this.db
        .update(assets)
        .set({
          status: "failed",
          lastError: `Maximum retry attempts exceeded (${maxRetries})`,
          walletId: null,
        })
        .where(eq(assets.id, assetId));

      return false;
    }

    // Atomically claim asset by updating status from "queued" to "assigned"
    const result = await this.db
      .update(assets)
      .set({
        status: "assigned",
        assignedAt: sql`NOW()`,
        retryCount: currentRetries, // Keep current retry count
      })
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.status, "queued"), // Only claim if still queued
        ),
      );

    const claimed = (result[0].affectedRows || 0) > 0;

    if (claimed) {
      console.log(
        `✅ Asset ${assetId} claimed for processing (retry ${currentRetries}/${maxRetries})`,
      );
    }

    return claimed;
  }

  /**
   * Handle asset failure with retry logic
   */
  async handleAssetFailure(
    assetId: number,
    errorMessage: string,
  ): Promise<void> {
    const asset = await this.db
      .select()
      .from(assets)
      .where(eq(assets.id, assetId))
      .limit(1);

    if (!asset.length) return;

    const currentAsset = asset[0];
    const maxRetries = currentAsset.maxAttempts || 3;
    const currentRetries = currentAsset.retryCount || 0;
    const newRetryCount = currentRetries + 1;

    if (newRetryCount < maxRetries) {
      // Queue for retry
      await this.db
        .update(assets)
        .set({
          status: "queued",
          queuedAt: sql`NOW()`,
          nextRetryAt: sql`NOW()`,
          retryCount: newRetryCount,
          lastError: errorMessage,
          walletId: null,
          assignedAt: null,
          publishingStartedAt: null,
        })
        .where(eq(assets.id, assetId));

      console.log(
        `🔄 Asset ${assetId} queued for retry (attempt ${newRetryCount}/${maxRetries})`,
      );
    } else {
      // Permanent failure
      await this.db
        .update(assets)
        .set({
          status: "failed",
          lastError: `Final failure after ${maxRetries} attempts: ${errorMessage}`,
          walletId: null,
        })
        .where(eq(assets.id, assetId));

      console.log(
        `❌ Asset ${assetId} permanently failed after ${maxRetries} attempts`,
      );
    }
  }

  /**
   * Create a publishing attempt record
   */
  async createPublishingAttempt(assetId: number, wallet: any): Promise<number> {
    // Get current asset to determine attempt number
    const asset = await this.db
      .select()
      .from(assets)
      .where(eq(assets.id, assetId))
      .limit(1);

    if (!asset.length) {
      throw new Error(
        `Asset ${assetId} not found when creating publishing attempt`,
      );
    }

    const currentAttemptCount = (asset[0].attemptCount || 0) + 1;

    // Create publishing attempt record
    const attemptResult = await this.db.insert(publishingAttempts).values({
      assetId,
      attemptNumber: currentAttemptCount,
      workerId: process.pid.toString(),
      walletAddress: wallet.address,
      walletId: wallet.id,
      otnodeUrl: process.env.DKG_ENDPOINT,
      blockchain: wallet.blockchain,
      status: "started",
      startedAt: sql`NOW()`,
    });

    // Update asset attempt count
    await this.db
      .update(assets)
      .set({
        attemptCount: currentAttemptCount,
      })
      .where(eq(assets.id, assetId));

    return attemptResult[0].insertId;
  }

  /**
   * Update publishing attempt record
   */
  async updatePublishingAttempt(
    attemptId: number,
    updates: {
      status: "started" | "success" | "failed" | "timeout";
      ual?: string;
      transactionHash?: string;
      errorType?: string;
      errorMessage?: string;
      gasUsed?: number;
      durationSeconds?: number;
    },
  ): Promise<void> {
    await this.db
      .update(publishingAttempts)
      .set({
        ...updates,
        completedAt: sql`NOW()`,
      })
      .where(eq(publishingAttempts.id, attemptId));
  }

  /**
   * Retry failed assets
   */
  async retryFailedAssets(criteria?: {
    source?: string;
    maxAttempts?: number;
  }): Promise<number> {
    let whereClause = eq(assets.status, "failed");

    if (criteria?.source) {
      whereClause = and(
        eq(assets.status, "failed"),
        eq(assets.source, criteria.source),
      );
    }

    if (criteria?.maxAttempts) {
      whereClause = and(
        whereClause,
        sql`attempt_count < ${criteria.maxAttempts}`,
      );
    }

    const result = await this.db
      .update(assets)
      .set({
        status: "queued",
        queuedAt: sql`NOW()`,
        lastError: null,
        retryCount: 0,
      })
      .where(whereClause);

    return result[0].affectedRows || 0;
  }

  /**
   * Get assets by status
   */
  async getAssetsByStatus(
    status:
      | "pending"
      | "queued"
      | "assigned"
      | "publishing"
      | "mint_submitted"
      | "published"
      | "failed",
  ): Promise<any[]> {
    return await this.db
      .select()
      .from(assets)
      .where(eq(assets.status, status))
      .orderBy(desc(assets.priority), assets.queuedAt);
  }

  /**
   * Cleanup event listeners
   */
  cleanup(): void {
    this.removeAllListeners();
  }

  /**
   * Get stuck assets
   */
  async getStuckAssets(
    type: "assigned" | "publishing",
    timeoutMinutes: number,
  ): Promise<any[]> {
    const now = new Date();

    if (type === "assigned") {
      // Only consider assets stuck if they're assigned but haven't started publishing yet
      // This prevents interfering with assets that are actively being published
      return await this.db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.status, "assigned"),
            sql`${assets.assignedAt} < DATE_SUB(${now}, INTERVAL ${timeoutMinutes} MINUTE)`,
            // Make sure publishingStartedAt is NULL (hasn't started publishing yet)
            sql`${assets.publishingStartedAt} IS NULL`,
          ),
        );
    } else {
      // Publishing assets that have been running too long
      return await this.db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.status, "publishing"),
            sql`${assets.publishingStartedAt} < DATE_SUB(${now}, INTERVAL ${timeoutMinutes} MINUTE)`,
          ),
        );
    }
  }

  /**
   * Get asset counts by status
   */
  async getAssetCountsByStatus(): Promise<{
    publishing: number;
    published: number;
    failed: number;
  }> {
    const [publishingResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(assets)
      .where(eq(assets.status, "publishing"));

    const [publishedResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(assets)
      .where(eq(assets.status, "published"));

    // Count only truly failed assets (retryCount >= maxAttempts)
    // This excludes assets that failed but will be retried
    const [failedResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(assets)
      .where(
        and(
          eq(assets.status, "failed"),
          sql`${assets.retryCount} >= ${assets.maxAttempts}`,
        ),
      );

    return {
      publishing: Number(publishingResult?.count || 0),
      published: Number(publishedResult?.count || 0),
      failed: Number(failedResult?.count || 0),
    };
  }
}
