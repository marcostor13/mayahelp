import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** GitHub allows letters, digits, dot, dash and underscore in owner/repo names. */
const GITHUB_NAME = /^[A-Za-z0-9._-]+$/;

export class SaveRepoDto {
  @IsString()
  @Matches(GITHUB_NAME, {
    message:
      'El propietario solo admite letras, números, punto, guion y guion bajo',
  })
  @MaxLength(100)
  owner: string;

  @IsString()
  @Matches(GITHUB_NAME, {
    message:
      'El repositorio solo admite letras, números, punto, guion y guion bajo',
  })
  @MaxLength(100)
  repo: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  baseBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  autoMerge?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Only sent when setting or replacing it; the stored one is kept otherwise. */
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  token?: string;
}
