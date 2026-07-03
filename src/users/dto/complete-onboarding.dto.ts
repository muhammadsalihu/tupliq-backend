import { IsArray, IsString } from 'class-validator';

export class CompleteOnboardingDto {
  @IsArray()
  @IsString({ each: true })
  selectedInterests!: string[];
}
