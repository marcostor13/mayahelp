import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreatePublicObservationDto {
  @IsString()
  @MinLength(2)
  reporterName: string;

  @IsEmail()
  reporterEmail: string;

  @IsString()
  @MinLength(3)
  subject: string;

  @IsString()
  @MinLength(5)
  description: string;
}
