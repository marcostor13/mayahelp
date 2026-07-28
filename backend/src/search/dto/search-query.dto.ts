import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchQueryDto {
  /**
   * Two characters minimum: a single letter matches most of the database and the
   * result would be noise, not an answer.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q: string;
}
