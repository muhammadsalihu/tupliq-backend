import { Module } from '@nestjs/common';
import { CustomWorkflowsController } from './custom-workflows.controller';
import { CustomWorkflowsService } from './custom-workflows.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [CustomWorkflowsController],
  providers: [CustomWorkflowsService],
})
export class CustomWorkflowsModule {}
