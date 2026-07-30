import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const MAX_RECIPIENTS = 20;
const MAX_TEMPLATE_VARIABLES = 10;

export class UpdateWhatsAppSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_RECIPIENTS)
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    each: true,
    message:
      'Cada número debe estar en formato internacional, ej. +5491122334455',
  })
  @IsOptional()
  recipients?: string[];

  @IsBoolean()
  @IsOptional()
  notifyClient?: boolean;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  templateName?: string;

  @IsString()
  @MaxLength(10)
  @IsOptional()
  templateLanguage?: string;

  @IsArray()
  @ArrayMaxSize(MAX_TEMPLATE_VARIABLES)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @IsOptional()
  variables?: string[];
}

export class UpdateEmailSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyClient?: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_RECIPIENTS)
  @IsEmail({}, { each: true })
  @IsOptional()
  recipients?: string[];
}

export class UpdateNotificationEventsDto {
  @IsBoolean()
  @IsOptional()
  ticketCreated?: boolean;

  @IsBoolean()
  @IsOptional()
  ticketUpdated?: boolean;

  @IsBoolean()
  @IsOptional()
  newComment?: boolean;
}

export class UpdateNotificationSettingsDto {
  @ValidateNested()
  @Type(() => UpdateWhatsAppSettingsDto)
  @IsOptional()
  whatsapp?: UpdateWhatsAppSettingsDto;

  @ValidateNested()
  @Type(() => UpdateEmailSettingsDto)
  @IsOptional()
  email?: UpdateEmailSettingsDto;

  @ValidateNested()
  @Type(() => UpdateNotificationEventsDto)
  @IsOptional()
  events?: UpdateNotificationEventsDto;
}
