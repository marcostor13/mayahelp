import { IsString, MinLength } from 'class-validator';

export class CheckDuplicateDto {
  @IsString()
  @MinLength(3)
  subject: string;

  @IsString()
  @MinLength(5)
  description: string;
}
