import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(name: string, email: string, password: string): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with that email already exists.');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { name: name.trim(), email, passwordHash },
    });

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
}
