import { IsString, IsOptional, IsHexColor, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBotDto {
  @ApiProperty({ description: 'Unique handle slug (alphanumeric + hyphens)' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Handle must be lowercase alphanumeric with hyphens only' })
  handle: string;

  @ApiProperty({ description: 'Display name' })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({ description: 'Role title, e.g. "Research Lead"' })
  @IsString()
  @MaxLength(80)
  title: string;

  @ApiPropertyOptional({ description: 'Job description / system prompt' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Accent color hex' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Emoji avatar' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  avatar?: string;
}

export class UpdateBotDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4)
  avatar?: string;
}
