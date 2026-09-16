import { ArrayUnique, IsArray, IsMongoId } from 'class-validator';

/** Reemplaza por completo la lista de proyectos visibles de una cuenta. */
export class AssignProjectsDto {
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  projects: string[];
}
