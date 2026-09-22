import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAgentProfileDto {
  @ApiPropertyOptional({ example: 'freelancer' })
  @IsOptional()
  @IsIn(['remote_worker', 'remote', 'freelancer', 'consultant', 'founder', 'small_business_owner', 'smallbiz', 'other'])
  role?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  goals?: string[];

  @ApiPropertyOptional({ enum: ['auto', 'google', 'openai', 'anthropic'] })
  @IsOptional()
  @IsIn(['auto', 'google', 'openai', 'anthropic'])
  aiPreference?: string;
}
