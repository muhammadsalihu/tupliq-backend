import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HackathonsModule } from './hackathons/hackathons.module';
import { InviteCodesModule } from './invite-codes/invite-codes.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    HackathonsModule,
    InviteCodesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
