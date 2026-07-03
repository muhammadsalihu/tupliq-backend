import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  notificationsOn?: boolean;

  @IsOptional()
  @IsBoolean()
  darkModeOn?: boolean;
}
