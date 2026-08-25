import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { IsIn, IsString, MinLength } from 'class-validator';
import { PushService } from './push.service';

class RegisterTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsIn(['android', 'ios'])
  platform!: string;
}

@ApiTags('push')
@ApiBearerAuth('bearer')
@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Store/refresh this device's Expo push token for the signed-in user. */
  @Post('register')
  register(@CurrentUser() user: RequestUser, @Body() dto: RegisterTokenDto) {
    return this.push.register(user.id, dto.token, dto.platform);
  }

  /** Sends a test notification to all of the user's registered devices. */
  @Post('test')
  test(@CurrentUser() user: RequestUser) {
    return this.push.sendToUser(user.id, {
      title: 'Tupliq Agent',
      body: 'Push notifications are working 🎉',
    });
  }

  @Get('tokens')
  tokens(@CurrentUser() user: RequestUser) {
    return this.push.tokensFor(user.id);
  }
}
