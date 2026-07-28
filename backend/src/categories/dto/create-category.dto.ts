import { IsEnum, IsOptional, IsString } from 'class-validator';
import type { AutoReplyMode, CategoryType } from '../schemas/category.schema';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsEnum(['ticket', 'article'])
  type: CategoryType;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['off', 'draft', 'auto'])
  @IsOptional()
  autoReplyMode?: AutoReplyMode;
}
