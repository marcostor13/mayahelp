import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { TicketPriority } from '../../common/enums/ticket.enum';

export class CreateTicketDto {
  /** Optional: when omitted it is derived from the first line of the description,
   *  the same way the public observation link does it. */
  @IsString()
  @MinLength(5)
  @IsOptional()
  subject?: string;

  @IsString()
  @MinLength(10)
  description: string;

  @IsMongoId()
  category: string;

  @IsMongoId()
  @IsOptional()
  client?: string;

  @IsMongoId()
  @IsOptional()
  project?: string;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;
}
