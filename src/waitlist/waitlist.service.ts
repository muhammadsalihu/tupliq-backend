import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';

const BLOCKED_DOMAINS = new Set([
  'tempmail.com','10minutemail.com','dispostable.com','guerrillamail.com',
  'mailinator.com','throwawaymail.com','fakeinbox.com','temp-mail.org',
  'yopmail.com','sharklasers.com','trashmail.com','mailnesia.com',
  'getnada.com','squibyd.com','tempinbox.com','abusemail.com',
]);

function isSuspiciousEmail(email: string): boolean {
  const [local, domain] = email.split('@');
  if (!local || !domain) return true;
  if (BLOCKED_DOMAINS.has(domain.toLowerCase())) return true;
  if (/\.{2,}/.test(local)) return true;
  // dots spaced ≤2 chars apart → machine-generated
  if (/\.(?=\.{0,2}[^.])/.test(local)) return true;
  return false;
}

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

    if (isSuspiciousEmail(email)) {
      this.logger.warn(`Blocked suspicious waitlist sign-up: ${email}`);
      return { ok: true, alreadyOnList: false, blocked: true };
    }

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