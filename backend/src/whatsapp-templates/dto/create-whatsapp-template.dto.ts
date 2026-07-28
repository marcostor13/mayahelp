import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export type WhatsAppTemplateCategory =
  'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

export class CreateWhatsAppTemplateDto {
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'El nombre solo puede contener minúsculas, números y guiones bajos',
  })
  @MinLength(3)
  @MaxLength(512)
  name: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsEnum(['UTILITY', 'MARKETING', 'AUTHENTICATION'])
  category: WhatsAppTemplateCategory;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  headerText?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  bodyText: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  footerText?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  @IsOptional()
  bodyExamples?: string[];
}
