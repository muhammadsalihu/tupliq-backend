import { Module } from '@nestjs/common';
import { InviteCodesController } from './invite-codes.controller';
import { InviteCodesService } from './invite-codes.service';

@Module({
  controllers: [InviteCodesController],
  providers: [InviteCodesService],
  exports: [InviteCodesService],
})
export class InviteCodesModule {}
