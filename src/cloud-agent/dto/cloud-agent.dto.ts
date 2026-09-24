import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ProvisionDto {
  @ApiPropertyOptional({ description: 'Friendly name for the instance' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class SendMessageDto {
  @ApiPropertyOptional({ description: 'Continue a previous conversation' })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
