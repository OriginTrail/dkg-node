export interface KnowledgeAssetManagerConfig {
  database: {
    connectionString: string;
  };
  redis: {
    host: string;
    port?: number;
    password?: string;
  };
  wallets: Array<{
    address: string;
    privateKey: string;
    blockchain: string;
  }>;
  workers?: {
    count?: number;
    concurrency?: number;
    retryDelay?: number;
    maxAttempts?: number;
  };
  storage?: {
    type: "filesystem" | "s3";
    path?: string;
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  dkg?: {
    endpoint?: string;
    blockchain?: string;
  };
  encryptionKey?: string;
}

export interface AssetInput {
  content: object | string;
  metadata?: {
    source?: string;
    sourceId?: string;
    [key: string]: any;
  };
  publishOptions?: {
    privacy?: "private" | "public";
    priority?: number;
    epochs?: number;
    maxAttempts?: number;
  };
}

export interface AssetStatus {
  id: number;
  status:
    | "pending"
    | "queued"
    | "assigned"
    | "publishing"
    | "mint_submitted"
    | "published"
    | "failed";
  ual?: string | null;
  transactionHash?: string | null;
  publishedAt?: Date | null;
  attemptCount: number;
  lastError?: string | null;
  metadata?: any;
}
