import { Type } from 'class-transformer';
import {
  IsArray,
  IsMongoId,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { FilterTicketDto } from '../../tickets/dto/filter-ticket.dto';

export class ExportCombinedDto {
  /** Explicit selection. When empty/absent, `filter` decides which tickets are exported. */
  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  ids?: string[];

  @ValidateNested()
  @Type(() => FilterTicketDto)
  @IsOptional()
  filter?: FilterTicketDto;
}
