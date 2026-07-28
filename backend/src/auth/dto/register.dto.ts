import { IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from '../../users/dto/create-user.dto';

export class RegisterDto extends CreateUserDto {
  @IsString()
  @IsOptional()
  declare company?: string;
}
