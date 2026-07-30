import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class TriggerRunDto {
  @IsMongoId()
  project: string;

  /** Capped so one run stays a reviewable pull request instead of a rewrite. */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsMongoId({ each: true })
  tickets: string[];

  /** Free-text steering for this run only, on top of the project instructions. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Overrides the project default for this run. */
  @IsOptional()
  @IsBoolean()
  autoMerge?: boolean;
}
