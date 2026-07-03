import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateInviteCodeDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  hackathonId!: string;

  @IsOptional()
  @IsEmail()
  invitedEmail?: string;
}
