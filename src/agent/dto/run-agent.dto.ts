import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RunAgentDto {
  /** Explicit workflow key. Omit together with customWorkflowId for auto routing. */
  @ApiPropertyOptional({ example: 'client_followup' })
  @IsOptional()
  @IsString()
  workflowKey?: string;

  /** Run a user-created custom workflow (Pro feature). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customWorkflowId?: string;

  /** Free-form natural-language request (required for auto mode). */
  @ApiPropertyOptional({ example: 'Draft a follow-up for Acme after our pricing call' })
  @IsOptional()
  @IsString()
  request?: string;

  /** Structured field values for the workflow form. */
  @ApiPropertyOptional({ example: { client_name: 'Acme Ltd', goal: 'Book a call' } })
  @IsOptional()
  @IsObject()
  input?: Record<string, string>;
}
