import { Module } from '@nestjs/common';
import { CloudAgentService } from './cloud-agent.service';
import { CloudAgentController } from './cloud-agent.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CloudAgentController],
  providers: [CloudAgentService],
  exports: [CloudAgentService],
})
export class CloudAgentModule {}
