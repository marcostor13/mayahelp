import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsMongoId,
} from 'class-validator';
import { TicketStatus } from '../../common/enums/ticket.enum';

export class BulkUpdateStatusDto {
  /** Tope alineado con lo que la tabla puede tener seleccionado de una sola vez. */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsMongoId({ each: true })
  ids: string[];

  @IsEnum(TicketStatus)
  status: TicketStatus;
}
