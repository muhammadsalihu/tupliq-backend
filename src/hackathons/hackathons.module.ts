import { Module } from '@nestjs/common';
import { HackathonsController } from './hackathons.controller';
import { HackathonsService } from './hackathons.service';
import { InviteCodesModule } from '../invite-codes/invite-codes.module';

@Module({
  imports: [InviteCodesModule],
  controllers: [HackathonsController],
  providers: [HackathonsService],
})
export class HackathonsModule {}
