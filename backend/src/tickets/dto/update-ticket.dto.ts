import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TicketPriority, TicketStatus } from '../../common/enums/ticket.enum';

export class UpdateTicketDto {
  @IsString()
  @MinLength(5)
  @IsOptional()
  subject?: string;

  @IsString()
  @MinLength(10)
  @IsOptional()
  description?: string;

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

  /**
   * Proyecto al que pertenece el ticket. `null` lo devuelve al buzón general.
   * No está en `CLIENT_EDITABLE_FIELDS`: clasificar es del equipo.
   */
  @IsMongoId()
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  project?: string | null;
}
