import { ConflictException, Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../email/email.service';
import { InviteCodesService } from '../invite-codes/invite-codes.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { UserProfile } from '../users/types/user-profile.type';

const SALT_ROUNDS = 10;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface AuthResult {
  accessToken: string;
  user: UserProfile;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly inviteCodesService: InviteCodesService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async register(name: string, email: string, password: string): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with that email already exists.');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { name: name.trim(), email, passwordHash },
    });

    await this.sendWelcomeInvite(user.name, user.email);

    return this.buildAuthResult(user.id, user.email);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Incorrect email or password.');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Incorrect email or password.');

    return this.buildAuthResult(user.id, user.email);
  }

  /**
   * Creates a single-use, one-hour reset token and emails it. Always
   * succeeds from the caller's perspective (no account enumeration).
   */
  async requestPasswordReset(email: string): Promise<{ ok: true }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });

    if (user) {
      // Invalidate any previous unused tokens.
      await this.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });

      const token = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      try {
        const appUrl = this.config.get<string>('APP_URL', 'https://tupliq.app');
        await this.emailService.sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl: `${appUrl}/reset-password?token=${token}`,
          token,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to send password reset email to ${user.email}: ${message}`);
      }
    }

    return { ok: true };
  }

  /** Consumes a valid reset token and sets the new password. */
  async resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  private async buildAuthResult(userId: string, email: string): Promise<AuthResult> {
    const accessToken = this.jwtService.sign({ sub: userId, email });
    const user = await this.usersService.getProfile(userId);
    return { accessToken, user };
  }

  private async sendWelcomeInvite(name: string, email: string): Promise<void> {
    try {
      const invite = await this.inviteCodesService.createForRegistration(
        email,
        this.config.get<string>('REGISTRATION_HACKATHON_ID'),
      );

      if (!invite) {
        // No hackathon exists — send a generic welcome email instead
        const appUrl = this.config.get<string>('APP_URL', 'https://www.tupliq.com');
        await this.emailService.sendGenericWelcomeEmail({ to: email, name });
        this.logger.log(`Sent generic welcome email to ${email} (no hackathon configured)`);
        return;
      }

      await this.emailService.sendWelcomeInviteEmail({
        to: email,
        name,
        inviteCode: invite.code,
        hackathonTitle: invite.hackathonTitle,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send welcome invite email to ${email}: ${message}`);
    }
  }
}
