import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';
import { InviteCodesService } from '../invite-codes/invite-codes.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { UserProfile } from '../users/types/user-profile.type';

const SALT_ROUNDS = 10;

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
        this.logger.warn('No hackathon exists. Skipping welcome invite email.');
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
