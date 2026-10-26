import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Alta pública: solo lo que una persona puede decidir sobre su propia cuenta. Antes
 * heredaba de `CreateUserDto` y aceptaba `role` y `projects`, así que cualquiera se
 * registraba como admin y con los proyectos que quisiera. Con `forbidNonWhitelisted`
 * esos campos ahora devuelven 400.
 */
export class RegisterDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsOptional()
  company?: string;
}
