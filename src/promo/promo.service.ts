import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — readable over voice/chat

@Injectable()
export class PromoService {
  private readonly logger = new Logger(PromoService.name);
  private readonly adminKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    // Reuse the backend's existing admin key (same one the waitlist admin endpoints use).
    this.adminKey = this.config.get<string>('ADMIN_API_KEY', '');
  }

  assertAdminKey(key?: string) {
    if (!this.adminKey) throw new ForbiddenException('Promo admin is not configured.');
    if (key !== this.adminKey) throw new ForbiddenException('Invalid admin key.');
  }

  /**
   * Mint N distinct codes in one call, e.g. seeds of a 10-seat campaign:
   *   POST /promo/admin/codes { count: 1, maxRedemptions: 10, durationDays: 30, description }
   * Or one code per user (maxRedemptions: 1) for tighter control.
   */
  async createCodes(dto: {
    count?: number;
    maxRedemptions?: number;
    durationDays?: number;
    description?: string;
    expiresAt?: string;
    prefix?: string;
  }) {
    const count = Math.min(Math.max(dto.count ?? 1, 1), 50);
    const maxRedemptions = Math.min(Math.max(dto.maxRedemptions ?? 1, 1), 1000);
    const durationDays = Math.min(Math.max(dto.durationDays ?? 30, 1), 365);
    const prefix = (dto.prefix ?? 'PRO').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

    const codes = [];
    for (let i = 0; i < count; i++) {
      let body = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const bytes = crypto.randomBytes(8);
        body = Array.from(bytes)
          .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
          .join('');
        const candidate = `${prefix}-${body.slice(0, 4)}-${body.slice(4, 8)}`;
        const exists = await this.prisma.promoCode.findUnique({ where: { code: candidate } });
        if (!exists) {
          codes.push(candidate);
          break;
        }
      }
      if (!codes[i]) throw new BadRequestException('Could not generate a unique code; retry.');
    }

    const created = await this.prisma.promoCode.createMany({
      data: codes.map((code) => ({
        code,
        description: dto.description ?? null,
        maxRedemptions,
        durationDays,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      })),
    });

    this.logger.log(`Minted ${created.count} promo codes (${prefix}*, maxRedemptions=${maxRedemptions}, duration=${durationDays}d)`);
    return {
      created: created.count,
      maxRedemptions,
      durationDays,
      codes,
    };
  }

  async listCodes() {
    return this.prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: { redemptions: { select: { userId: true, redeemedAt: true } } },
    });
  }

  async deactivate(codeId: string) {
    const code = await this.prisma.promoCode.findUnique({ where: { id: codeId } });
    if (!code) throw new NotFoundException('Promo code not found.');
    return this.prisma.promoCode.update({ where: { id: codeId }, data: { active: false } });
  }

  /**
   * Redeem: idempotent per (code, user). Grants `tupliq-pro` for durationDays from NOW,
   * unless the user already has an active subscription with a later expiry — in which case
   * the promo extends it from that date instead of losing days.
   */
  async redeem(userId: string, rawCode: string) {
    const code = (rawCode ?? '').trim().toUpperCase();
    if (!code) throw new BadRequestException('Enter a promo code.');

    const promo = await this.prisma.promoCode.findUnique({ where: { code } });
    if (!promo) throw new NotFoundException('That promo code was not found.');
    if (!promo.active) throw new BadRequestException('This promo code is no longer active.');
    if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This promo code has expired.');
    }
    if (promo.redeemedCount >= promo.maxRedemptions) {
      throw new BadRequestException('This promo code has no redemptions left.');
    }

    const existing = await this.prisma.promoRedemption.findUnique({
      where: { codeId_userId: { codeId: promo.id, userId } },
    });
    if (existing) {
      throw new BadRequestException('You have already redeemed this promo code.');
    }

    // Seat is consumed atomically with the redemption row (unique constraint backstops the race).
    const [redemption] = await this.prisma.$transaction([
      this.prisma.promoRedemption.create({ data: { codeId: promo.id, userId } }),
      this.prisma.promoCode.update({
        where: { id: promo.id },
        data: { redeemedCount: { increment: 1 } },
      }),
    ]);

    const now = Date.now();
    const current = await this.prisma.subscription.findUnique({
      where: { userId_entitlement: { userId, entitlement: 'tupliq-pro' } },
    });
    const base =
      current?.active && current.expiresAt && current.expiresAt.getTime() > now
        ? current.expiresAt.getTime()
        : now;
    const expiresAt = new Date(base + promo.durationDays * 24 * 60 * 60 * 1000);

    await this.prisma.subscription.upsert({
      where: { userId_entitlement: { userId, entitlement: 'tupliq-pro' } },
      update: { active: true, willRenew: false, expiresAt, store: 'promo', productId: `promo:${promo.code}` },
      create: {
        userId,
        entitlement: 'tupliq-pro',
        active: true,
        willRenew: false,
        expiresAt,
        store: 'promo',
        productId: `promo:${promo.code}`,
      },
    });

    this.logger.log(`Promo ${promo.code} redeemed by user ${userId} (+${promo.durationDays}d pro until ${expiresAt.toISOString()})`);
    return {
      ok: true,
      days: promo.durationDays,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async myRedemptions(userId: string) {
    const rows = await this.prisma.promoRedemption.findMany({
      where: { userId },
      include: { code: { select: { code: true, durationDays: true, description: true } } },
      orderBy: { redeemedAt: 'desc' },
    });
    return rows.map((r) => ({
      code: r.code.code,
      days: r.code.durationDays,
      description: r.code.description,
      redeemedAt: r.redeemedAt,
    }));
  }
}
