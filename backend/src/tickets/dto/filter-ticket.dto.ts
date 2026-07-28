import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import {
  TicketPriority,
  TicketSource,
  TicketStatus,
} from '../../common/enums/ticket.enum';
import { PaginationQueryDto } from '../../common/pagination/pagination';

export class FilterTicketDto extends PaginationQueryDto {
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsMongoId()
  @IsOptional()
  category?: string;

  @IsMongoId()
  @IsOptional()
  project?: string;

  @IsMongoId()
  @IsOptional()
  assignedAgent?: string;

  /** Staff-only; silently ignored for clients, who are always scoped to themselves. */
  @IsMongoId()
  @IsOptional()
  client?: string;

  @IsEnum(TicketSource)
  @IsOptional()
  source?: TicketSource;

  @IsString()
  @IsOptional()
  search?: string;
}
