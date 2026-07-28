import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { TicketPriority } from '../../common/enums/ticket.enum';

export class CreateTicketDto {
  @IsString()
  @MinLength(5)
  subject: string;

  @IsString()
  @MinLength(10)
  description: string;

  @IsMongoId()
  category: string;

  @IsMongoId()
  @IsOptional()
  client?: string;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;
}
