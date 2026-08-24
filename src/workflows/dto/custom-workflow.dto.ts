import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomWorkflowFieldDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  label!: string;

  @ApiPropertyOptional({ enum: ['text', 'textarea', 'select', 'number'] })
  @IsOptional()
  @IsIn(['text', 'textarea', 'select', 'number'])
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeholder?: string;
}

export class CreateCustomWorkflowDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ type: [CustomWorkflowFieldDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CustomWorkflowFieldDto)
  inputFields?: CustomWorkflowFieldDto[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  instructions!: string;

  @ApiPropertyOptional({ enum: ['auto', 'google', 'openai', 'anthropic'] })
  @IsOptional()
  @IsIn(['auto', 'google', 'openai', 'anthropic'])
  aiPreference?: string;
}

export class UpdateCustomWorkflowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ type: [CustomWorkflowFieldDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CustomWorkflowFieldDto)
  inputFields?: CustomWorkflowFieldDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  instructions?: string;

  @ApiPropertyOptional({ enum: ['auto', 'google', 'openai', 'anthropic'] })
  @IsOptional()
  @IsIn(['auto', 'google', 'openai', 'anthropic'])
  aiPreference?: string;
}
