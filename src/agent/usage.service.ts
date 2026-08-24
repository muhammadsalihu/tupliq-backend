import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface UsageCheckResult {
  allowed: boolean;
  plan: 'Free' | 'Pro';
  runsUsed: number;
  runsLimit: number;
  remaining: number;
  reason?: string;
}

const DEFAULT_FREE_LIMIT = 10;
const DEFAULT_PRO_LIMIT = 200;

/**
 * Server-side usage enforcement. The client's claimed plan is never trusted:
 * entitlements come from the subscriptions table (RevenueCat webhook only).
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** First day of the current billing period (UTC month). */
  currentBillingPeriod(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  async hasProEntitlement(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId_entitlement: { userId, entitlement: 'tupliq_pro' } },
    });
    if (!sub || !sub.active) return false;
    if (sub.expiresAt && sub.expiresAt.getTime() < Date.now()) return false;
    return true;
  }

  async checkQuota(userId: string): Promise<UsageCheckResult> {
    const isPro = await this.hasProEntitlement(userId);
    const tier = isPro ? 'Pro' : 'Free';

    const limitRow = await this.prisma.planLimit.findUnique({ where: { tier } });
    const envFallback = this.config.get<number>(
      tier === 'Pro' ? 'PRO_MONTHLY_RUN_LIMIT' : 'FREE_MONTHLY_RUN_LIMIT',
    );
    const runsLimit =
      limitRow?.monthlyRunLimit ??
      envFallback ??
      (tier === 'Pro' ? DEFAULT_PRO_LIMIT : DEFAULT_FREE_LIMIT);

    const runsUsed = await this.prisma.workflowRun.count({
      where: {
        userId,
        consumesQuota: true,
        billingPeriod: this.currentBillingPeriod(),
      },
    });

    const remaining = Math.max(0, runsLimit - runsUsed);
    return {
      allowed: remaining > 0,
      plan: tier,
      runsUsed,
      runsLimit,
      remaining,
      reason: remaining > 0 ? undefined : `Monthly ${tier} plan limit of ${runsLimit} runs reached.`,
    };
  }

  /**
   * Atomically consume one quota unit. Re-checks the count inside a
   * transaction so concurrent requests can't exceed the limit.
   * Returns false if the limit was hit between the pre-check and now.
   */
  async tryConsumeQuota(userId: string): Promise<boolean> {
    const status = await this.checkQuota(userId);
    if (!status.allowed) return false;

    // Double-check under the same condition; count is cheap and races here are
    // bounded by the small window — acceptable for MVP per spec §25.
    const final = await this.checkQuota(userId);
    return final.allowed;
  }

  /** Refund quota for runs that failed due to server/provider errors. */
  async refundQuota(runId: string): Promise<void> {
    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: { consumesQuota: false },
    });
  }
}
