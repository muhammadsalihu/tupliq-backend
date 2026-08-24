import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { UsageService } from './usage.service';

@ApiTags('usage')
@ApiBearerAuth('bearer')
@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get()
  getStatus(@CurrentUser() user: RequestUser) {
    return this.usageService.getStatus(user.id);
  }
}
