import {
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateArticleDto {
  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @MinLength(10)
  content: string;

  @IsMongoId()
  category: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsBoolean()
  @IsOptional()
  popular?: boolean;
}
