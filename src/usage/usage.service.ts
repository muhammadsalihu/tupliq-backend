import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WorkflowRunStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { UsageLimitException } from '../common/http-exceptions';

const MAX_TRANSACTION_RETRIES = 3;

export interface UsageStatus {
  tier: 'free' | 'pro';
  limit: number;
  used: number;
  remaining: number;
  periodStart: string;
}

/** First day (UTC) of the month containing `date`. */
export function billingPeriodStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}

  async getStatus(userId: string): Promise<UsageStatus> {
    const tier = await this.billing.getTier(userId);
    const limit = await this.monthlyLimit(tier);
    const period = billingPeriodStart();
    const used = await this.prisma.workflowRun.count({
      where: { userId, billingPeriod: period, consumesQuota: true },
    });
    return {
      tier,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      periodStart: period.toISOString(),
    };
  }

  /**
   * Atomically reserves one run of quota and creates the run row.
   * Serializable transaction + bounded retry prevents concurrent-request
   * bypasses. Throws UsageLimitException when the monthly quota is exhausted.
   */
  async reserveRun(
    userId: string,
    data: {
      workflowKey: string;
      customWorkflowId?: string | null;
      title: string;
      request: string;
      input: Record<string, unknown>;
    },
  ): Promise<string> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const tier = await this.billing.getTier(userId);
            const limit = await this.monthlyLimit(tier);
            const period = billingPeriodStart();

            const used = await tx.workflowRun.count({
              where: { userId, billingPeriod: period, consumesQuota: true },
            });
            if (used >= limit) throw new UsageLimitException(tier, limit);

            const run = await tx.workflowRun.create({
              data: {
                userId,
                workflowKey: data.workflowKey,
                customWorkflowId: data.customWorkflowId ?? null,
                title: data.title,
                request: data.request,
                input: data.input as Prisma.InputJsonValue,
                status: 'Running' as WorkflowRunStatus,
                consumesQuota: true,
                billingPeriod: period,
              },
              select: { id: true },
            });
            return run.id;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof UsageLimitException) throw error;
        const isWriteConflict =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!isWriteConflict || attempt === MAX_TRANSACTION_RETRIES) throw error;
        this.logger.warn(`Quota reservation conflict (attempt ${attempt}); retrying.`);
      }
    }
    throw new Error('Unreachable');
  }

  /** Marks a run finished successfully; quota stays consumed. */
  completeRun(
    runId: string,
    patch: {
      result: unknown;
      provider?: string | null;
      model?: string | null;
      durationMs?: number;
      steps?: unknown;
    },
  ): Promise<unknown> {
    return this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: 'Succeeded',
        result: patch.result as Prisma.InputJsonValue,
        steps: (patch.steps ?? []) as Prisma.InputJsonValue,
        provider: patch.provider ?? null,
        model: patch.model ?? null,
        durationMs: patch.durationMs ?? null,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Marks a run failed AND refunds quota — server/provider failures never
   * consume the user's monthly allowance.
   */
  async failAndRefund(runId: string, errorMessage: string, durationMs?: number): Promise<void> {
    try {
      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: 'Failed',
          error: errorMessage.slice(0, 1000),
          consumesQuota: false,
          durationMs: durationMs ?? null,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to persist failure for run ${runId}: ${String(error)}`);
    }
  }

  private async monthlyLimit(tier: 'free' | 'pro'): Promise<number> {
    const planTier: 'Free' | 'Pro' = tier === 'pro' ? 'Pro' : 'Free';
    const row = await this.prisma.planLimit.findUnique({ where: { tier: planTier } });
    if (row) return row.monthlyRunLimit;
    const fallback =
      tier === 'pro'
        ? Number(this.config.get<number>('PRO_MONTHLY_RUN_LIMIT', 200))
        : Number(this.config.get<number>('FREE_MONTHLY_RUN_LIMIT', 10));
    return fallback;
  }
}
