import {
  mysqlTable,
  varchar,
  bigint,
  text,
  timestamp,
  boolean,
  int,
  mysqlEnum,
  unique,
  index,
  primaryKey,
  char,
  serial,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

// Assets table: Core table for tracking knowledge assets
export const assets = mysqlTable(
  "assets",
  {
    id: serial("id").primaryKey(),
    walletId: int("wallet_id").references(() => wallets.id, {
      onDelete: "set null",
    }),
    batchId: int("batch_id"),

    // Content and metadata
    contentUrl: text("content_url").notNull(),
    contentSize: bigint("content_size", { mode: "number" }).notNull(),
    source: varchar("source", { length: 100 }),
    sourceId: varchar("source_id", { length: 255 }),

    // Publishing configuration
    priority: int("priority").default(50),
    privacy: mysqlEnum("privacy", ["private", "public"]).default("private"),
    epochs: int("epochs").default(2),
    replications: int("replications").default(1),
    maxAttempts: int("max_attempts").default(3),

    // Status and attempts
    status: mysqlEnum("status", [
      "pending",
      "queued",
      "assigned",
      "publishing",
      "published",
      "failed",
    ])
      .notNull()
      .default("pending"),
    statusMessage: text("status_message"),
    attemptCount: int("attempt_count").default(0),
    retryCount: int("retry_count").default(0),
    nextRetryAt: timestamp("next_retry_at"),
    lastError: text("last_error"),

    // Publishing results
    ual: varchar("ual", { length: 255 }).unique(),
    transactionHash: varchar("transaction_hash", { length: 66 }),
    blockchain: varchar("blockchain", { length: 50 }),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    queuedAt: timestamp("queued_at"),
    assignedAt: timestamp("assigned_at"),
    publishingStartedAt: timestamp("publishing_started_at"),
    publishedAt: timestamp("published_at"),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    statusIdx: index("idx_status").on(table.status),
    retryIdx: index("idx_retry").on(table.status, table.nextRetryAt),
    sourceIdx: index("idx_source").on(table.source, table.sourceId),
    pendingIdx: index("idx_pending").on(table.status, table.createdAt),
    batchIdx: index("idx_batch").on(table.batchId),
  }),
);

// Wallets table: Manages wallet pool for publishing
export const wallets = mysqlTable(
  "wallets",
  {
    id: serial("id").primaryKey(),
    address: varchar("address", { length: 42 }).notNull().unique(),
    privateKey: text("private_key_encrypted").notNull(),
    blockchain: varchar("blockchain", { length: 50 }).notNull(),
    isActive: boolean("is_active").default(true),
    isLocked: boolean("is_locked").default(false),
    lockedBy: varchar("locked_by", { length: 100 }),
    lockedAt: timestamp("locked_at"),
    lastUsedAt: timestamp("last_used_at"),
    totalUses: int("total_uses").default(0),
    successfulUses: int("successful_uses").default(0),
    failedUses: int("failed_uses").default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    availableIdx: index("idx_available").on(
      table.isActive,
      table.isLocked,
      table.lastUsedAt,
    ),
  }),
);

// Publishing attempts table: Audit trail for all publishing attempts
export const publishingAttempts = mysqlTable(
  "publishing_attempts",
  {
    id: serial("id").primaryKey(),
    assetId: int("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    attemptNumber: int("attempt_number").notNull(),
    workerId: varchar("worker_id", { length: 100 }),
    walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
    walletId: int("wallet_id").references(() => wallets.id),
    otnodeUrl: text("otnode_url"),
    blockchain: varchar("blockchain", { length: 50 }),
    transactionHash: varchar("transaction_hash", { length: 66 }),
    gasUsed: bigint("gas_used", { mode: "number" }),
    status: mysqlEnum("status", [
      "started",
      "success",
      "failed",
      "timeout",
    ]).notNull(),
    ual: varchar("ual", { length: 255 }),
    errorType: varchar("error_type", { length: 50 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at").notNull(),
    completedAt: timestamp("completed_at"),
    durationSeconds: int("duration_seconds"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    assetAttemptsIdx: index("idx_asset_attempts").on(
      table.assetId,
      table.attemptNumber,
    ),
    walletUsageIdx: index("idx_wallet_usage").on(
      table.walletAddress,
      table.startedAt,
    ),
  }),
);

// Batch table: Track batch operations
export const batches = mysqlTable(
  "batches",
  {
    id: serial("id").primaryKey(),
    batchName: varchar("batch_name", { length: 255 }),
    source: varchar("source", { length: 100 }),
    totalAssets: int("total_assets").notNull().default(0),
    pendingCount: int("pending_count").notNull().default(0),
    processingCount: int("processing_count").notNull().default(0),
    publishedCount: int("published_count").notNull().default(0),
    failedCount: int("failed_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    batchStatusIdx: index("idx_batch_status").on(
      table.createdAt,
      table.completedAt,
    ),
  }),
);

// Metrics table: Store aggregated hourly metrics
export const metricsHourly = mysqlTable(
  "metrics_hourly",
  {
    hourTimestamp: timestamp("hour_timestamp").primaryKey().notNull(),
    assetsRegistered: int("assets_registered").default(0),
    assetsPublished: int("assets_published").default(0),
    assetsFailed: int("assets_failed").default(0),
    avgPublishDurationSeconds: int("avg_publish_duration_seconds"),
    totalGasUsed: bigint("total_gas_used", { mode: "number" }),
    uniqueWalletsUsed: int("unique_wallets_used"),
  },
  (table) => ({
    metricsHourIdx: index("idx_metrics_hour").on(table.hourTimestamp),
  }),
);

// Wallet performance metrics
export const walletMetrics = mysqlTable(
  "wallet_metrics",
  {
    walletId: int("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(),
    totalPublishes: int("total_publishes").default(0),
    successfulPublishes: int("successful_publishes").default(0),
    failedPublishes: int("failed_publishes").default(0),
    avgDurationSeconds: int("avg_duration_seconds"),
    totalGasUsed: bigint("total_gas_used", { mode: "number" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.walletId, table.date] }),
  }),
);

// Define relations
export const assetsRelations = relations(assets, ({ one, many }) => ({
  batch: one(batches, {
    fields: [assets.batchId],
    references: [batches.id],
  }),
  publishingAttempts: many(publishingAttempts),
}));

export const walletsRelations = relations(wallets, ({ many }) => ({
  publishingAttempts: many(publishingAttempts),
  metrics: many(walletMetrics),
}));

export const publishingAttemptsRelations = relations(
  publishingAttempts,
  ({ one }) => ({
    asset: one(assets, {
      fields: [publishingAttempts.assetId],
      references: [assets.id],
    }),
    wallet: one(wallets, {
      fields: [publishingAttempts.walletId],
      references: [wallets.id],
    }),
  }),
);

export const batchesRelations = relations(batches, ({ many }) => ({
  assets: many(assets),
}));

export const walletMetricsRelations = relations(walletMetrics, ({ one }) => ({
  wallet: one(wallets, {
    fields: [walletMetrics.walletId],
    references: [wallets.id],
  }),
}));

// Type exports
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type PublishingAttempt = typeof publishingAttempts.$inferSelect;
export type NewPublishingAttempt = typeof publishingAttempts.$inferInsert;
export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;
