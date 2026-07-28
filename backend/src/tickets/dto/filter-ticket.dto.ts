import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { TicketPriority, TicketStatus } from '../../common/enums/ticket.enum';

export class FilterTicketDto {
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsMongoId()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  search?: string;
}
