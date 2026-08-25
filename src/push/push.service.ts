import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo push tickets confirm receipt but not delivery; keep this bounded. */
const MAX_TOKENS_PER_USER = 10;

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Upsert the device token (users can have several devices). */
  async register(userId: string, token: string, platform: string) {
    const existing = await this.prisma.pushToken.findUnique({ where: { token } });
    if (existing && existing.userId !== userId) {
      // Device re-registered under a different account — move it.
      await this.prisma.pushToken.delete({ where: { token } });
    }
    return this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }

  async tokensFor(userId: string) {
    return this.prisma.pushToken.findMany({
      where: { userId },
      select: { id: true, platform: true, createdAt: true },
    });
  }

  /** Fire-and-forget push via the Expo push service. Never throws. */
  async sendToUser(userId: string, message: { title: string; body: string; data?: Record<string, unknown> }) {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      take: MAX_TOKENS_PER_USER,
    });
    if (tokens.length === 0) return { sent: 0 };

    const responses = await Promise.allSettled(
      tokens.map(({ token }) =>
        fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: token, sound: 'default', ...message }),
        }),
      ),
    );

    let sent = 0;
    for (const [i, result] of responses.entries()) {
      if (result.status === 'fulfilled' && result.value.ok) {
        sent += 1;
      } else {
        const detail =
          result.status === 'rejected'
            ? String(result.reason)
            : `HTTP ${result.value.status}: ${(await result.value.text().catch(() => '')).slice(0, 200)}`;
        // DeviceTokenNotForTopic / unregistered → prune so we stop retrying it.
        if (/DeviceNotRegistered|DeviceToken/i.test(detail)) {
          await this.prisma.pushToken.delete({ where: { token: tokens[i].token } }).catch(() => {});
        }
        this.logger.warn(`Push to ${tokens[i].token.slice(0, 12)}… failed: ${detail}`);
      }
    }
    return { sent };
  }
}
