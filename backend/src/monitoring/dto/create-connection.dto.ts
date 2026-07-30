import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ConnectionType } from '../schemas/project-connection.schema';

export class AlertEventsDto {
  @IsBoolean() @IsOptional() down?: boolean;
  @IsBoolean() @IsOptional() recovered?: boolean;
  @IsBoolean() @IsOptional() slow?: boolean;
  @IsBoolean() @IsOptional() unexpectedResponse?: boolean;
  @IsBoolean() @IsOptional() sslInvalid?: boolean;
  @IsBoolean() @IsOptional() sslExpiring?: boolean;
  @IsBoolean() @IsOptional() dnsFailure?: boolean;
  @IsBoolean() @IsOptional() highCpu?: boolean;
  @IsBoolean() @IsOptional() highMemory?: boolean;
  @IsBoolean() @IsOptional() highDisk?: boolean;
  @IsBoolean() @IsOptional() serviceDown?: boolean;
  @IsBoolean() @IsOptional() deployFailed?: boolean;
  @IsBoolean() @IsOptional() providerSuspended?: boolean;
}

export class AlertThresholdsDto {
  @IsInt() @Min(100) @Max(120_000) @IsOptional() responseMs?: number;
  @IsInt() @Min(1) @Max(100) @IsOptional() cpuPercent?: number;
  @IsInt() @Min(1) @Max(100) @IsOptional() memoryPercent?: number;
  @IsInt() @Min(1) @Max(100) @IsOptional() diskPercent?: number;
  @IsInt() @Min(1) @Max(365) @IsOptional() sslDaysBefore?: number;
  @IsInt() @Min(1) @Max(10) @IsOptional() failureThreshold?: number;
}

export class AlertSettingsDto {
  @IsBoolean() @IsOptional() enabled?: boolean;
  @IsBoolean() @IsOptional() email?: boolean;
  @IsBoolean() @IsOptional() whatsapp?: boolean;

  @IsString({ each: true }) @IsOptional() extraEmails?: string[];
  @IsString({ each: true }) @IsOptional() extraPhones?: string[];

  @IsInt() @Min(1) @Max(1440) @IsOptional() repeatAfterMinutes?: number;

  @ValidateNested()
  @Type(() => AlertEventsDto)
  @IsOptional()
  events?: AlertEventsDto;

  @ValidateNested()
  @Type(() => AlertThresholdsDto)
  @IsOptional()
  thresholds?: AlertThresholdsDto;
}

export class CreateConnectionDto {
  @IsMongoId()
  project: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsEnum(ConnectionType)
  type: ConnectionType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @Min(1)
  @Max(1440)
  @IsOptional()
  intervalMinutes?: number;

  // http
  @IsString() @IsOptional() url?: string;
  @IsInt() @Min(100) @Max(599) @IsOptional() expectedStatus?: number;
  @IsString() @MaxLength(200) @IsOptional() expectedText?: string;

  // ssh
  @IsString() @IsOptional() host?: string;
  @IsInt() @Min(1) @Max(65535) @IsOptional() port?: number;
  @IsString() @IsOptional() username?: string;

  // provider
  @IsString() @IsOptional() serviceId?: string;
  @IsString() @IsOptional() providerBaseUrl?: string;

  // secrets — stored encrypted, never returned
  @IsString() @IsOptional() password?: string;
  @IsString() @IsOptional() privateKey?: string;
  @IsString() @IsOptional() passphrase?: string;
  @IsString() @IsOptional() apiToken?: string;

  @ValidateNested()
  @Type(() => AlertSettingsDto)
  @IsOptional()
  alerts?: AlertSettingsDto;
}
