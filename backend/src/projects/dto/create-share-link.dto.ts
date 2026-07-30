import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ReporterInputDto } from './reporter-input.dto';

export class CreateShareLinkDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReporterInputDto)
  @ArrayMaxSize(50)
  @IsOptional()
  reporters?: ReporterInputDto[];
}
