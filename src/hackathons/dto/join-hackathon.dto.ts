import { IsString, MinLength } from 'class-validator';

export class JoinHackathonDto {
  @IsString()
  @MinLength(1)
  code!: string;
}
