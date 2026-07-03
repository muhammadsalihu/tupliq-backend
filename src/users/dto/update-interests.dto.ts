import { IsArray, IsString } from 'class-validator';

export class UpdateInterestsDto {
  @IsArray()
  @IsString({ each: true })
  selectedInterests!: string[];
}
