import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateConnectionDto } from './create-connection.dto';

/** The project a connection belongs to never changes. */
export class UpdateConnectionDto extends PartialType(
  OmitType(CreateConnectionDto, ['project', 'type'] as const),
) {}
