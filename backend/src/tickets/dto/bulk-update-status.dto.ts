import { ArrayNotEmpty, IsArray, IsEnum, IsMongoId } from 'class-validator';
import { TicketStatus } from '../../common/enums/ticket.enum';

export class BulkUpdateStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  ids: string[];

  @IsEnum(TicketStatus)
  status: TicketStatus;
}
