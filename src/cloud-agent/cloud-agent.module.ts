import { Module, forwardRef } from '@nestjs/common';
import { CloudAgentService } from './cloud-agent.service';
import { CloudAgentController, CloudAgentNotifyController } from './cloud-agent.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BotsModule } from './bots/bots.module';
import { PushModule } from '../push/push.module';
import { BillingModule } from '../billing/billing.module';
import { CronParserService } from './cron-parser.service';

@Module({
  imports: [PrismaModule, forwardRef(() => BotsModule), PushModule, BillingModule],
  controllers: [CloudAgentController, CloudAgentNotifyController],
  providers: [CloudAgentService, CronParserService],
  exports: [CloudAgentService],
})
export class CloudAgentModule {}