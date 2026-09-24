import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';

/**
 * Interest list for the Agent Android app (closed testing) — captured from
 * tupliq.com/agent so the owner can see who wants in and book demos.
 *
 * Signups are idempotent: the same address twice returns alreadyOnList, never an
 * error, so a double-tap on the form is not a failed submission for the visitor.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async join(dto: CreateWaitlistEntryDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.agentWaitlistEntry.findUnique({
      where: { email },
    });
    if (existing) {
      return { ok: true, alreadyOnList: true };
    }

    const entry = await this.prisma.agentWaitlistEntry.create({
      data: {
        email,
        name: dto.name?.trim() || null,
        goal: dto.goal?.trim() || null,
        source: dto.source?.trim() || 'agent-page',
      },
    });

    // Never let a notification failure fail the signup.
    void this.email
      .sendWaitlistNotification({
        email: entry.email,
        name: entry.name,
        goal: entry.goal,
        source: entry.source,
      })
      .catch((err) =>
        this.logger.error(`Waitlist notification failed: ${err?.message ?? err}`),
      );

    return { ok: true, alreadyOnList: false };
  }

  async list(limit = 200) {
    const take = Math.min(Math.max(limit, 1), 500);
    const [entries, total] = await Promise.all([
      this.prisma.agentWaitlistEntry.findMany({
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.agentWaitlistEntry.count(),
    ]);
    return { total, returned: entries.length, entries };
  }
}
