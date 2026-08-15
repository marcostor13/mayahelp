import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateDatabaseConnectionDto } from './create-database-connection.dto';

/**
 * El tipo no se cambia: pasar de `atlas` a `ssh` deja campos y secretos del modo anterior
 * colgando. Para cambiarlo se borra la conexión y se crea de nuevo.
 */
export class UpdateDatabaseConnectionDto extends PartialType(
  OmitType(CreateDatabaseConnectionDto, ['type'] as const),
) {}
