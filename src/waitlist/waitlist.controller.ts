import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  /** Public: tupliq.com/agent posts here. No auth by design. */
  @Post()
  @HttpCode(201)
  join(@Body() dto: CreateWaitlistEntryDto) {
    return this.waitlistService.join(dto);
  }

  /** Admin only (x-admin-key): read the list to book demos. */
  @Get()
  @UseGuards(AdminGuard)
  list(@Query('limit') limit?: string) {
    return this.waitlistService.list(limit ? Number(limit) : 200);
  }
}
