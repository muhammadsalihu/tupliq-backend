import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

export interface BillingStatus {
  tier: 'free' | 'pro';
  isPro: boolean;
  entitlement: string;
  productId: string | null;
  expiresAt: string | null;
  willRenew: boolean;
}

/**
 * Entitlement truth lives here and only here. Rows are written exclusively
 * by the RevenueCat webhook — client-claimed purchase state is never trusted.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** True when the user currently holds an active tupliq_pro entitlement. */
  async isPro(userId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId_entitlement: { userId, entitlement: this.entitlement() } },
    });
    if (!subscription || !subscription.active) return false;
    if (subscription.expiresAt && subscription.expiresAt.getTime() < Date.now()) return false;
    return true;
  }

  async getTier(userId: string): Promise<'free' | 'pro'> {
    return (await this.isPro(userId)) ? 'pro' : 'free';
  }

  async getStatus(userId: string): Promise<BillingStatus> {
    const isPro = await this.isPro(userId);
    if (!isPro) {
      return {
        tier: 'free',
        isPro: false,
        entitlement: this.entitlement(),
        productId: null,
        expiresAt: null,
        willRenew: false,
      };
    }
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId_entitlement: { userId, entitlement: this.entitlement() } },
    });
    return {
      tier: 'pro',
      isPro: true,
      entitlement: this.entitlement(),
      productId: subscription?.productId ?? null,
      expiresAt: subscription?.expiresAt?.toISOString() ?? null,
      willRenew: subscription?.willRenew ?? true,
    };
  }

  /**
   * Applies a RevenueCat webhook event to the subscription table.
   * Unknown users are ignored (logged) so stale events never fail the webhook.
   */
  async applyWebhookEvent(event: RevenueCatEvent): Promise<void> {
    const userId = event.app_user_id;
    if (!userId) {
      this.logger.warn(`Webhook event ${event.type} has no app_user_id; ignoring.`);
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      this.logger.warn(`Webhook event ${event.type} for unknown user ${userId}; ignoring.`);
      return;
    }

    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;

    let active = true;
    let willRenew = true;
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'NON_RENEWING_PURCHASE':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION':
        active = true;
        willRenew = event.type === 'NON_RENEWING_PURCHASE' ? false : true;
        break;
      case 'CANCELLATION':
        // User cancelled but keeps access until expiration.
        active = true;
        willRenew = false;
        break;
      case 'EXPIRATION':
        active = false;
        willRenew = false;
        break;
      case 'BILLING_ISSUE':
      case 'TRANSFER':
      case 'TEST':
      default:
        // Keep current state; just record the event.
        active = undefined;
        break;
    }

    const data = {
      productId: event.product_id ?? null,
      store: event.store ?? null,
      willRenew,
      expiresAt,
      lastEvent: event as unknown as object,
    };

    await this.prisma.subscription.upsert({
      where: { userId_entitlement: { userId, entitlement: this.entitlement() } },
      create: {
        userId,
        entitlement: this.entitlement(),
        active: active ?? true,
        ...data,
      },
      update: { ...(active !== undefined ? { active } : {}), ...data },
    });

    this.logger.log(`Applied RevenueCat event ${event.type} for user ${userId}.`);
  }

  private entitlement(): string {
    return this.config.get<string>('REVENUECAT_ENTITLEMENT', 'tupliq_pro');
  }
}

/** Minimal typed subset of the RevenueCat webhook payload we consume. */
export interface RevenueCatEvent {
  type: string;
  app_user_id?: string | null;
  product_id?: string | null;
  store?: string | null;
  expiration_at_ms?: number | null;
  environment?: string;
  [key: string]: unknown;
}
