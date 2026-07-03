import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { UpdateInterestsDto } from './dto/update-interests.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('onboarding')
  completeOnboarding(@CurrentUser() user: RequestUser, @Body() dto: CompleteOnboardingDto) {
    return this.usersService.completeOnboarding(user.id, dto.selectedInterests);
  }

  @Patch('interests')
  updateInterests(@CurrentUser() user: RequestUser, @Body() dto: UpdateInterestsDto) {
    return this.usersService.updateInterests(user.id, dto.selectedInterests);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: RequestUser, @Body() dto: UpdateSettingsDto) {
    return this.usersService.updateSettings(user.id, dto);
  }

  @Post('agents-explored/:agentId')
  markAgentExplored(@CurrentUser() user: RequestUser, @Param('agentId') agentId: string) {
    return this.usersService.markAgentExplored(user.id, agentId);
  }
}
