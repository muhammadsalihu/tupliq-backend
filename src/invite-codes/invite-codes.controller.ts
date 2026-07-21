import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InviteCodesService } from './invite-codes.service';
import { CreateInviteCodeDto } from './dto/create-invite-code.dto';

@ApiTags('invite-codes')
@Controller('invite-codes')
export class InviteCodesController {
  constructor(private readonly inviteCodesService: InviteCodesService) {}

  @Post()
  create(@Body() dto: CreateInviteCodeDto) {
    return this.inviteCodesService.create(dto);
  }
}
