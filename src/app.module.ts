import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HackathonsModule } from './hackathons/hackathons.module';
import { InviteCodesModule } from './invite-codes/invite-codes.module';
import { AgentModule } from './agent/agent.module';
import { UsageModule } from './usage/usage.module';
import { BillingModule } from './billing/billing.module';
import { CustomWorkflowsModule } from './workflows/custom-workflows.module';
import { RunsModule } from './runs/runs.module';
import { SavedOutputsModule } from './saved-outputs/saved-outputs.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    HackathonsModule,
    InviteCodesModule,
    AgentModule,
    UsageModule,
    BillingModule,
    CustomWorkflowsModule,
    RunsModule,
    SavedOutputsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
