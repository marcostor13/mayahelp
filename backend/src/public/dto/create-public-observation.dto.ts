import { IsMongoId, IsString, MinLength } from 'class-validator';

export class CreatePublicObservationDto {
  @IsMongoId()
  reporterId: string;

  @IsString()
  @MinLength(5)
  description: string;

  @IsMongoId()
  category: string;
}
