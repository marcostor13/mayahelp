import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail } from 'class-validator';

export class CreateUsersFromReportersDto {
  /** Emails of link reporters to turn into client accounts. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  emails: string[];
}
