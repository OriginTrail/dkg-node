import { Database } from "../database";
import { wallets, assets } from "../database/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export interface WalletStats {
  total: number;
  available: number;
  inUse: number;
  avgUsage: number;
}

export class WalletService {
  constructor(private db: Database) {}

  /**
   * Get any active wallet without locking it (for read-only operations)
   */
  async getWalletForQueries(): Promise<any> {
    const wallet = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.isActive, true))
      .limit(1);

    return wallet.length > 0 ? wallet[0] : null;
  }

  /**
   * Get an available wallet and lock it atomically
   */
  async assignWalletToAsset(assetId): Promise<any> {
    return await this.db.transaction(async (tx) => {
      // Get first available wallet with row lock
      const availableWallet = await tx
        .select()
        .from(wallets)
        .where(and(eq(wallets.isActive, true), eq(wallets.isLocked, false)))
        .limit(1)
        .for("update");

      if (!availableWallet.length) {
        return null;
      }

      const wallet = availableWallet[0];

      // Lock the wallet
      await tx
        .update(wallets)
        .set({
          isLocked: true,
          lockedAt: sql`NOW()`,
        })
        .where(eq(wallets.id, wallet.id));

      // Update asset with wallet assignment
      await tx
        .update(assets)
        .set({
          walletId: wallet.id,
        })
        .where(eq(assets.id, assetId));

      return wallet;
    });
  }

  /**
   * Lock a specific wallet
   */
  async lockWallet(walletId: number): Promise<void> {
    await this.db
      .update(wallets)
      .set({
        isLocked: true,
        lockedAt: sql`NOW()`,
      })
      .where(eq(wallets.id, walletId));
  }

  /**
   * Release a wallet after use
   */
  async releaseWallet(walletId: number, success: boolean): Promise<void> {
    const updates: any = {
      isLocked: false,
      lockedAt: null,
      lastUsedAt: sql`NOW()`,
      totalUses: sql`total_uses + 1`,
    };

    if (success) {
      updates.successfulUses = sql`successful_uses + 1`;
    } else {
      updates.failedUses = sql`failed_uses + 1`;
    }

    await this.db.update(wallets).set(updates).where(eq(wallets.id, walletId));
  }

  /**
   * Get wallet statistics
   */
  async getWalletStats(): Promise<WalletStats> {
    const stats = await this.db
      .select({
        total: sql<number>`COUNT(*)`,
        available: sql<number>`SUM(CASE WHEN is_locked = FALSE THEN 1 ELSE 0 END)`,
        inUse: sql<number>`SUM(CASE WHEN is_locked = TRUE THEN 1 ELSE 0 END)`,
        avgUsage: sql<number>`AVG(total_uses)`,
      })
      .from(wallets)
      .where(eq(wallets.isActive, true));

    return {
      total: Number(stats[0].total) || 0,
      available: Number(stats[0].available) || 0,
      inUse: Number(stats[0].inUse) || 0,
      avgUsage: Number(stats[0].avgUsage) || 0,
    };
  }

  /**
   * Get wallet by ID with private key
   */
  async getWalletById(walletId: number): Promise<any> {
    const wallet = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);

    if (!wallet.length) {
      return null;
    }

    return wallet[0];
  }

  /**
   * Check wallet health
   */
  async checkWalletHealth(walletId: number): Promise<boolean> {
    const wallet = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);

    if (!wallet.length) {
      return false;
    }

    // Check if wallet has been locked for too long (>30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    if (
      wallet[0].isLocked &&
      wallet[0].lockedAt &&
      wallet[0].lockedAt < thirtyMinutesAgo
    ) {
      console.warn(`Wallet ${walletId} has been locked for over 30 minutes`);
      return false;
    }

    return true;
  }

  /**
   * Force unlock stuck wallets
   */
  async unlockStuckWallets(): Promise<number> {
    const result = await this.db
      .update(wallets)
      .set({
        isLocked: false,
        lockedAt: null,
      })
      .where(
        and(
          eq(wallets.isLocked, true),
          sql`locked_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`,
        ),
      );

    return result[0].affectedRows || 0;
  }
}
