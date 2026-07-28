import { IsOptional, IsString, MinLength } from 'class-validator';

export class AiDraftTicketDto {
  @IsString()
  @MinLength(5)
  freeText: string;

  @IsString()
  @IsOptional()
  imageBase64?: string;
}
