import { IsEnum, IsOptional, IsString } from 'class-validator';
import type { CategoryType } from '../schemas/category.schema';

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
}
