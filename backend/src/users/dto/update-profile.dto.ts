import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * What a user may change about themselves. Role and active state are deliberately absent:
 * PATCH /users/me used to accept the full admin payload, which let any client promote
 * themselves to admin.
 */
export class UpdateProfileDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  company?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
