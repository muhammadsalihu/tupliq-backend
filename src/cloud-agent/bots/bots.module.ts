
import { Module } from '@nestjs/common';
import { BotsService } from './bots.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudAgentModule } from '../cloud-agent.module';

@Module({
  imports: [PrismaModule, CloudAgentModule],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
