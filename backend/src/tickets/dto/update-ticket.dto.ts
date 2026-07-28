import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { TicketPriority, TicketStatus } from '../../common/enums/ticket.enum';

export class UpdateTicketDto {
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsMongoId()
  @IsOptional()
  assignedAgent?: string;

  @IsMongoId()
  @IsOptional()
  category?: string;
}
