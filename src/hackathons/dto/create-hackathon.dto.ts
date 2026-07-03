import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

class LessonInput {
  @IsString()
  @MinLength(1)
  title!: string;
}

class VideoInput {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  duration!: string;
}

class PartnerInput {
  @IsString()
  @MinLength(1)
  name!: string;
}

export class CreateHackathonDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsIn(['Live', 'Upcoming'])
  tag!: 'Live' | 'Upcoming';

  @IsString()
  @MinLength(1)
  desc!: string;

  @IsString()
  @MinLength(1)
  meta!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LessonInput)
  lessons?: LessonInput[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VideoInput)
  videos?: VideoInput[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerInput)
  partners?: PartnerInput[];
}
