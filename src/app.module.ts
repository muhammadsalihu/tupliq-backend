import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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
import { PushModule } from './push/push.module';
import { CloudAgentModule } from './cloud-agent/cloud-agent.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { HealthController } from './health/health.controller';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';

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
    PushModule,
    CloudAgentModule,
    WaitlistModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
