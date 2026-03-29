/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { PublishingService } from "../../../../../packages/plugin-dkg-publisher/src/services/PublishingService";
import { DkgService } from "../../../../../packages/plugin-dkg-publisher/src/services/DkgService";
import { QueueService } from "../../../../../packages/plugin-dkg-publisher/src/services/QueueService";

// Minimal fake DB that mimics the chained drizzle calls used in PublishingService
class FakeDb {
  public assetRow: any;
  public updates: any[];

  constructor(assetRow: any) {
    this.assetRow = assetRow;
    this.updates = [];
  }

  select() {
    return {
      from: () => ({
        where: () => ({
          limit: async () => [this.assetRow],
        }),
      }),
    };
  }

  update() {
    const self = this;
    return {
      set(values: any) {
        return {
          where: async () => {
            self.updates.push(values);
            return [{ affectedRows: 1 }];
          },
        };
      },
    };
  }
}

// Fake phased client to avoid hitting real dkg.js
class FakePhasedClient {
  public publishCalled: boolean;
  public mintCalled: boolean;
  public ual: string;
  public txHash: string;

  constructor(ual: string, txHash: string) {
    this.ual = ual;
    this.txHash = txHash;
    this.publishCalled = false;
    this.mintCalled = false;
  }

  async publishPhase() {
    this.publishCalled = true;
    return {
      readyForMint: true,
      publishOperationId: "op-123",
    };
  }

  async mintPhase() {
    this.mintCalled = true;
    return {
      UAL: this.ual,
      mintKnowledgeCollectionReceipt: { transactionHash: this.txHash },
    };
  }
}

describe("PublishingService phased publish", () => {
  const wallet = {
    id: 1,
    address: "0xabc",
    privateKey: "0xkey",
    blockchain: "chain",
  };
  const assetRow = {
    id: 42,
    contentUrl: "http://example.com/test.json",
    epochs: 2,
    replications: 1,
    privacy: "private",
    status: "queued",
  };

  let fakeDb: FakeDb;
  let fakeClient: FakePhasedClient;
  let publishingService: PublishingService;
  let originalFetch: any;

  beforeEach(() => {
    fakeDb = new FakeDb(assetRow);
    fakeClient = new FakePhasedClient("did:dkg:ual123", "0xtxhash");

    // Stub DkgService to return our fake phased client
    const dkgServiceStub = {
      createWalletPhasedClient: () => fakeClient,
    } as unknown as DkgService;

    publishingService = new PublishingService(fakeDb as any, dkgServiceStub);

    // Stub fetch used for loading content
    originalFetch = (global as any).fetch;
    (global as any).fetch = async () => ({
      ok: true,
      json: async () => ({ foo: "bar" }),
    });
  });

  afterEach(() => {
    (global as any).fetch = originalFetch as any;
  });

  it("runs publish+mint phases and sets status mint_submitted", async () => {
    const result = await publishingService.publishAsset(assetRow.id, wallet);

    expect(result.success).to.equal(true);
    expect(result.ual).to.equal("did:dkg:ual123");
    expect(fakeClient.publishCalled).to.equal(true);
    expect(fakeClient.mintCalled).to.equal(true);

    // Last DB update should set status to mint_submitted and store UAL/tx
    const lastUpdate = fakeDb.updates[fakeDb.updates.length - 1];
    expect(lastUpdate.status).to.equal("mint_submitted");
    expect(lastUpdate.ual).to.equal("did:dkg:ual123");
    expect(lastUpdate.transactionHash).to.equal("0xtxhash");
  });
});

describe("QueueService finality-check handler", () => {
  it("marks asset published when finality is reached", async () => {
    // Fake asset/DB/wallet/DKG services
    const assetService = {
      getAsset: async () => ({ id: 7, ual: "did:dkg:ual123" }),
      updateAssetStatus: async (_id: number, status: string) => {
        expect(status).to.equal("published");
      },
    };
    const walletService = {
      getWalletForQueries: async () => ({
        id: 1,
        address: "0xabc",
        privateKey: "0xkey",
      }),
    };
    const dkgService = {
      createWalletPhasedClient: () => ({
        finalityPhase: async () => ({
          finality: { status: "FINALIZED" },
          numberOfConfirmations: 3,
          requiredConfirmations: 1,
        }),
      }),
    } as unknown as DkgService;

    const queueService = Object.create(QueueService.prototype) as any;
    queueService.assetService = assetService;
    queueService.walletService = walletService;
    queueService.dkgService = dkgService;

    const job = {
      id: "job-1",
      data: { assetId: 7, ual: "did:dkg:ual123" },
      updateProgress: async () => {},
    } as any;

    const res = await queueService.processFinalityJob(job, 0);
    expect(res.success).to.equal(true);
    expect(res.assetId).to.equal(7);
  });

  it("bubbles error when finality is not reached (timeout/lag)", async () => {
    let updateCalled = false;

    const assetService = {
      getAsset: async () => ({ id: 8, ual: "did:dkg:ual999" }),
      updateAssetStatus: async () => {
        updateCalled = true;
      },
    };
    const walletService = {
      getWalletForQueries: async () => ({
        id: 2,
        address: "0xdef",
        privateKey: "0xkey2",
      }),
    };
    const dkgService = {
      createWalletPhasedClient: () => ({
        finalityPhase: async () => ({
          finality: { status: "NOT FINALIZED" },
          numberOfConfirmations: 0,
          requiredConfirmations: 3,
        }),
      }),
    } as unknown as DkgService;

    const queueService = Object.create(QueueService.prototype) as any;
    queueService.assetService = assetService;
    queueService.walletService = walletService;
    queueService.dkgService = dkgService;

    const job = {
      id: "job-2",
      data: { assetId: 8, ual: "did:dkg:ual999" },
      updateProgress: async () => {},
    } as any;

    let caught = false;
    try {
      await queueService.processFinalityJob(job, 0);
    } catch (error: any) {
      caught = true;
      expect(error.message).to.include("Finality not reached");
    }

    expect(caught).to.equal(true);
    expect(updateCalled).to.equal(false);
  });

  it("enqueues a finality-check job after successful publish+mint", async () => {
    let finalityCalled = false;
    let finalityArgs: any = null;

    const queueService = Object.create(QueueService.prototype) as any;
    queueService.assetService = {
      claimAssetForProcessing: async () => true,
      createPublishingAttempt: async () => 99,
      updatePublishingAttempt: async () => {},
      handleAssetFailure: async () => {},
    };
    queueService.walletService = {
      assignWalletToAsset: async () => ({
        id: 1,
        address: "0xabc",
        privateKey: "0xkey",
      }),
      releaseWallet: async () => {},
    };
    queueService.publishingService = {
      publishAsset: async () => ({
        success: true,
        ual: "did:dkg:ual123",
        transactionHash: "0xtxhash",
      }),
    };
    queueService.enqueueFinalityJob = async (
      assetId: number,
      priority: number,
      ual: string,
      transactionHash: string,
    ) => {
      finalityCalled = true;
      finalityArgs = { assetId, priority, ual, transactionHash };
    };

    const job = {
      id: "job-publish",
      data: { assetId: 123 },
      opts: { priority: 50 },
      timestamp: Date.now(),
      updateProgress: async () => {},
    } as any;

    const res = await queueService.processPublishJob(job, 0);

    expect(res.success).to.equal(true);
    expect(finalityCalled).to.equal(true);
    expect(finalityArgs).to.deep.equal({
      assetId: 123,
      priority: 50,
      ual: "did:dkg:ual123",
      transactionHash: "0xtxhash",
    });
  });
});
