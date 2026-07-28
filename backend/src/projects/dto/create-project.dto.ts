import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { ProjectStatus } from '../schemas/project.schema';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['planning', 'in_progress', 'on_hold', 'completed'])
  @IsOptional()
  status?: ProjectStatus;

  @IsMongoId()
  @IsOptional()
  client?: string;

  @IsMongoId()
  defaultCategory: string;
}
