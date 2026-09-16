import { ArrayNotEmpty, IsArray, IsMongoId, ValidateIf } from 'class-validator';

/** Clasifica varios tickets de una vez; `project: null` los manda al buzón general. */
export class BulkUpdateProjectDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  ids: string[];

  @IsMongoId()
  @ValidateIf((_, value) => value !== null)
  project: string | null;
}
