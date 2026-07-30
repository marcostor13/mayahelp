import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Posted by the GitHub workflow itself, authenticated with the run's shared secret. */
export class RunCallbackDto {
  @IsIn(['running', 'pr_open', 'failed'])
  status: 'running' | 'pr_open' | 'failed';

  @IsOptional()
  @IsInt()
  @Min(1)
  prNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  workflowUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;
}
