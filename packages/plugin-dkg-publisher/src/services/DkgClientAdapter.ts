/**
 * Lightweight adapter interface for DKG phased operations so we can
 * inject fakes in tests without pulling in the real dkg.js client.
 */
export interface DkgPhasedClient {
  publishPhase(
    content: any,
    options?: Record<string, any>,
  ): Promise<PublishPhaseResult>;
  mintPhase(
    publishContext: PublishPhaseResult,
    stepHooks?: Record<string, any>,
  ): Promise<MintPhaseResult>;
  finalityPhase(
    ual: string,
    options?: Record<string, any>,
  ): Promise<FinalityPhaseResult>;
}

export interface PublishPhaseResult {
  readyForMint?: boolean;
  datasetRoot?: string;
  datasetSize?: number;
  knowledgeAssetsAmount?: number;
  publishOperationId?: string;
  publishOperationResult?: any;
  blockchain?: any;
  endpoint?: string;
  port?: string | number;
  hashFunctionId?: number;
  immutable?: boolean;
  tokenAmount?: string | number | bigint;
  payer?: string;
  minimumNumberOfFinalizationConfirmations?: number;
  minimumNumberOfNodeReplications?: number;
  epochsNum?: number;
  contentAssetStorageAddress?: string;
  signatures?: any;
  publisherNodeSignature?: any;
  operation?: any;
}

export interface MintPhaseResult {
  UAL: string;
  datasetRoot: string;
  knowledgeCollectionId: string | number;
  mintKnowledgeCollectionReceipt: any;
}

export interface FinalityPhaseResult {
  finality: {
    status: string;
  };
  numberOfConfirmations: number;
  requiredConfirmations: number;
}

/**
 * Adapter around a real dkg.js client instance. We keep this thin so we
 * can swap in a mock DkgPhasedClient in tests without loading dkg.js.
 */
export class RealDkgPhasedClient implements DkgPhasedClient {
  constructor(private client: any) {}

  async publishPhase(
    content: any,
    options: Record<string, any> = {},
  ): Promise<PublishPhaseResult> {
    return this.client.asset.publishAssetPhase(content, options);
  }

  async mintPhase(
    publishContext: PublishPhaseResult,
    stepHooks: Record<string, any> = {},
  ): Promise<MintPhaseResult> {
    const hasHooks = stepHooks && Object.keys(stepHooks).length > 0;
    if (hasHooks) {
      return this.client.asset.mintKnowledgeCollectionPhase(
        publishContext,
        {},
        stepHooks,
      );
    }
    return this.client.asset.mintKnowledgeCollectionPhase(publishContext);
  }

  async finalityPhase(
    ual: string,
    options: Record<string, any> = {},
  ): Promise<FinalityPhaseResult> {
    return this.client.asset.finalizePublishPhase(ual, options);
  }
}
