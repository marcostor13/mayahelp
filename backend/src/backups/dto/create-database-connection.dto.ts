import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DatabaseConnectionType } from '../schemas/database-connection.schema';
import { BackupFrequency } from '../lima-schedule';

export class BackupScheduleDto {
  @IsEnum(BackupFrequency)
  @IsOptional()
  frequency?: BackupFrequency;

  @IsInt() @Min(0) @Max(23) @IsOptional() hour?: number;
  @IsInt() @Min(0) @Max(59) @IsOptional() minute?: number;
  @IsInt() @Min(0) @Max(6) @IsOptional() dayOfWeek?: number;
  @IsInt() @Min(1) @Max(28) @IsOptional() dayOfMonth?: number;
}

export class CreateDatabaseConnectionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsEnum(DatabaseConnectionType)
  type: DatabaseConnectionType;

  @IsString() @MaxLength(120) @IsOptional() database?: string;

  @IsBoolean() @IsOptional() isActive?: boolean;

  // ssh
  @IsString() @IsOptional() sshHost?: string;
  @IsInt() @Min(1) @Max(65535) @IsOptional() sshPort?: number;
  @IsString() @IsOptional() sshUsername?: string;
  @IsString() @IsOptional() mongoHost?: string;
  @IsInt() @Min(1) @Max(65535) @IsOptional() mongoPort?: number;
  @IsString() @IsOptional() mongoUsername?: string;
  @IsString() @IsOptional() authDatabase?: string;

  // secretos — se guardan cifrados y la API nunca los devuelve
  /** URI completa de conexión (tipo `atlas`), con usuario y contraseña adentro. */
  @IsString() @IsOptional() uri?: string;
  @IsString() @IsOptional() sshPassword?: string;
  @IsString() @IsOptional() sshPrivateKey?: string;
  @IsString() @IsOptional() sshPassphrase?: string;
  @IsString() @IsOptional() mongoPassword?: string;

  @IsInt() @Min(1) @Max(30) @IsOptional() retentionCount?: number;

  @ValidateNested()
  @Type(() => BackupScheduleDto)
  @IsOptional()
  schedule?: BackupScheduleDto;
}
