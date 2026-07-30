import {
  IsBooleanString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { TicketPriority, TicketStatus } from '../../common/enums/ticket.enum';

/** Fields the client may sort by. Whitelisted so the query can never inject an arbitrary path. */
export enum TicketSortField {
  CODE = 'code',
  SUBJECT = 'subject',
  STATUS = 'status',
  PRIORITY = 'priority',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

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

  @IsMongoId()
  @IsOptional()
  project?: string;

  @IsMongoId()
  @IsOptional()
  client?: string;

  @IsMongoId()
  @IsOptional()
  assignedAgent?: string;

  /** 'true' restricts to tickets with no agent assigned yet. */
  @IsBooleanString()
  @IsOptional()
  unassigned?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(TicketSortField)
  @IsOptional()
  sort?: TicketSortField;

  @IsEnum(SortOrder)
  @IsOptional()
  order?: SortOrder;
}
