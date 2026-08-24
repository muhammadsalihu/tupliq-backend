import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { BillingService, RevenueCatEvent } from './billing.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly config: ConfigService,
  ) {}

  /**
   * RevenueCat webhook. Authenticated with the shared webhook secret via
   * `Authorization: Bearer <secret>` (or the raw secret header).
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() request: Request, @Body() payload: { event?: RevenueCatEvent }) {
    const expected = this.config.get<string>('REVENUECAT_WEBHOOK_SECRET');
    const provided = (request.headers['authorization'] as string | undefined)?.replace(
      /^Bearer\s+/i,
      '',
    );

    if (!expected || provided !== expected) {
      throw new UnauthorizedException('Invalid webhook secret.');
    }

    if (!payload?.event) return { ok: true };
    await this.billingService.applyWebhookEvent(payload.event);
    return { ok: true };
  }

  /** Current entitlement as recorded server-side (never client-claimed). */
  @Get('status')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: RequestUser) {
    return this.billingService.getStatus(user.id);
  }
}
