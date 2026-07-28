import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsDateString()
  @IsOptional()
  dueAt?: string;
}
