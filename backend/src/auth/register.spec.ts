import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { Role } from '../common/enums/role.enum';

/** La misma configuración que `main.ts`: lo que no está en el DTO devuelve 400. */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

function validate(body: Record<string, unknown>): Promise<unknown> {
  return pipe.transform(body, { type: 'body', metatype: RegisterDto });
}

const VALID = {
  name: 'Ana',
  email: 'ana@acme.com',
  password: 'una-contraseña',
};

describe('Registro público', () => {
  /** Antes cualquiera mandaba `role: "admin"` y entraba como administrador. */
  it('rechaza que quien se registra elija su rol', async () => {
    await expect(validate({ ...VALID, role: Role.ADMIN })).rejects.toThrow();
  });

  it('rechaza que quien se registra elija sus proyectos', async () => {
    await expect(
      validate({ ...VALID, projects: ['6a1b2c3d4e5f6a7b8c9d0e1f'] }),
    ).rejects.toThrow();
  });

  it('acepta lo que manda el formulario de registro', async () => {
    await expect(
      validate({ ...VALID, company: 'Acme' }),
    ).resolves.toBeInstanceOf(RegisterDto);
  });

  it('crea la cuenta siempre como cliente', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'user-1',
      name: 'Ana',
      email: 'ana@acme.com',
      role: Role.CLIENT,
    } as unknown as UserDocument);
    const usersService = {
      create,
      setRefreshTokenHash: () => Promise.resolve(),
    } as unknown as UsersService;
    const auth = new AuthService(
      usersService,
      { signAsync: () => Promise.resolve('token') } as unknown as JwtService,
      { get: () => 'secreto' } as unknown as ConfigService,
    );

    await auth.register({ ...VALID, company: 'Acme' });

    expect(create).toHaveBeenCalledWith({
      ...VALID,
      company: 'Acme',
      role: Role.CLIENT,
    });
  });
});
