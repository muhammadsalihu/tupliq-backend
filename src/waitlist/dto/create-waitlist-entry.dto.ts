import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWaitlistEntryDto {
  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** What they want the agent to do — used to qualify demo calls. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;
}
