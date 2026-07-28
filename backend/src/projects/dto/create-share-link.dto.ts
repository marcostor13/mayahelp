import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateShareLinkDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
