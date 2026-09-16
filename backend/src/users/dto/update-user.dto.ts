import { PartialType, OmitType } from '@nestjs/mapped-types';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/** Admin-only edit: can change role, active state and the projects the person sees. */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** Reemplaza la lista completa de proyectos asignados. */
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  @IsOptional()
  projects?: string[];
}
