import { Module, forwardRef } from '@nestjs/common';
import { BotsService } from './bots.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudAgentModule } from '../cloud-agent.module';

@Module({
  imports: [PrismaModule, forwardRef(() => CloudAgentModule)],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}