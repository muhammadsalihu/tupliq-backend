import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { PromoService } from './promo.service';

class CreateCodesDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  count?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxRedemptions?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  prefix?: string;
}

class RedeemDto {
  @IsString()
  @MaxLength(40)
  code!: string;
}

/**
 * Promo codes.
 *
 * - /promo/redeem + /promo/mine: JWT-authed, for users in the app.
 * - /promo/admin/*: x-admin-key header (same key as the waitlist admin endpoints).
 *   Kept in a separate controller so the admin surface never sits behind the user guard.
 */
@ApiTags('promo')
@Controller('promo')
export class PromoController {
  constructor(private readonly promo: PromoService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @Post('redeem')
  redeem(@CurrentUser() user: RequestUser, @Body() dto: RedeemDto) {
    return this.promo.redeem(user.id, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @Get('mine')
  mine(@CurrentUser() user: RequestUser) {
    return this.promo.myRedemptions(user.id);
  }

  private adminKey(headers: Headers) {
    return (headers as unknown as Record<string, string | undefined>)['x-admin-key'];
  }

  @Post('admin/codes')
  create(@Headers() headers: Headers, @Body() dto: CreateCodesDto) {
    this.promo.assertAdminKey(this.adminKey(headers));
    return this.promo.createCodes(dto);
  }

  @Get('admin/codes')
  list(@Headers() headers: Headers) {
    this.promo.assertAdminKey(this.adminKey(headers));
    return this.promo.listCodes();
  }

  @Post('admin/codes/:id/deactivate')
  deactivate(@Headers() headers: Headers, id: string) {
    this.promo.assertAdminKey(this.adminKey(headers));
    return this.promo.deactivate(id);
  }
}
