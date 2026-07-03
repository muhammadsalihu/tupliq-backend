import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteCodeDto } from './dto/create-invite-code.dto';
import { RedeemResult } from './types/redeem-result.type';

@Injectable()
export class InviteCodesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInviteCodeDto) {
    const hackathon = await this.prisma.hackathon.findUnique({ where: { id: dto.hackathonId } });
    if (!hackathon) throw new NotFoundException('Hackathon not found');

    return this.prisma.inviteCode.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        hackathonId: dto.hackathonId,
        invitedEmail: dto.invitedEmail,
      },
    });
  }

  // Runs as a single DB transaction so the code can never be marked used
  // without the user actually being added as a participant, or vice versa —
  // mirrors the Firestore transaction this replaces (services/inviteCodes.ts
  // on the mobile app).
  async redeem(rawCode: string, hackathonId: string, userId: string): Promise<RedeemResult> {
    const code = rawCode.trim().toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const inviteCode = await tx.inviteCode.findUnique({ where: { code } });

      if (!inviteCode) return { ok: false, reason: 'not_found' };
      if (inviteCode.hackathonId !== hackathonId) return { ok: false, reason: 'wrong_hackathon' };
      if (inviteCode.used) return { ok: false, reason: 'already_used' };

      // Conditional update is the actual race guard: if two requests redeem
      // the same code at once, only one UPDATE ... WHERE used = false can
      // affect a row — the loser sees count 0 and reports already_used.
      const { count } = await tx.inviteCode.updateMany({
        where: { code, used: false },
        data: { used: true, usedByUserId: userId, usedAt: new Date() },
      });
      if (count === 0) return { ok: false, reason: 'already_used' };

      await tx.hackathonParticipant.upsert({
        where: { userId_hackathonId: { userId, hackathonId } },
        create: { userId, hackathonId },
        update: {},
      });

      return { ok: true };
    });
  }
}
