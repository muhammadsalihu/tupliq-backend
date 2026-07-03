import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { InviteCodesService } from './invite-codes.service';
import { CreateInviteCodeDto } from './dto/create-invite-code.dto';

@ApiTags('invite-codes')
@ApiSecurity('admin-key')
@Controller('invite-codes')
@UseGuards(AdminGuard)
export class InviteCodesController {
  constructor(private readonly inviteCodesService: InviteCodesService) {}

  @Post()
  create(@Body() dto: CreateInviteCodeDto) {
    return this.inviteCodesService.create(dto);
  }
}
