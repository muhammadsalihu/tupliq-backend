import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RunAgentDto {
  @ApiProperty({
    description:
      'Workflow key: client_followup | proposal_generator | meeting_to_tasks | daily_planner | research_assistant | content_repurposer | general | custom:<uuid>',
  })
  @IsString()
  @MaxLength(80)
  workflowId!: string;

  @ApiProperty({ description: 'Workflow inputs (field name → value).', required: false })
  @IsOptional()
  @IsObject()
  input?: Record<string, string>;

  @ApiProperty({
    description: 'Free-form request for natural-language / general mode.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  request?: string;

  @ApiProperty({ enum: ['auto', 'google', 'openai', 'anthropic'], required: false })
  @IsOptional()
  @IsString()
  aiPreference?: string;
}
