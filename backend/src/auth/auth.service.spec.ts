import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { Role } from '../common/enums/role.enum';

const PASSWORD = 'la-contraseña';

async function userDoc(
  overrides: Partial<UserDocument> = {},
): Promise<UserDocument> {
  return {
    id: 'user-1',
    name: 'Ana',
    email: 'ana@acme.com',
    role: Role.CLIENT,
    isActive: true,
    mustChangePassword: false,
    passwordHash: await bcrypt.hash(PASSWORD, 10),
    ...overrides,
  } as unknown as UserDocument;
}

function service(user: UserDocument | null): AuthService {
  const usersService = {
    findByEmailWithPassword: () => Promise.resolve(user),
    findByIdWithRefreshToken: () => Promise.resolve(user),
    setRefreshTokenHash: () => Promise.resolve(),
  } as unknown as UsersService;

  const jwtService = {
    signAsync: () => Promise.resolve('un-token'),
  } as unknown as JwtService;

  return new AuthService(usersService, jwtService, {
    get: () => 'un-valor',
  } as unknown as ConfigService);
}

describe('AuthService.login — cuentas desactivadas', () => {
  it('deja entrar a una cuenta activa', async () => {
    const result = await service(await userDoc()).login({
      email: 'ana@acme.com',
      password: PASSWORD,
    });

    expect(result.accessToken).toBe('un-token');
  });

  it('rechaza a una cuenta desactivada aunque la contraseña sea correcta', async () => {
    const user = await userDoc({ isActive: false });

    await expect(
      service(user).login({ email: 'ana@acme.com', password: PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /**
   * El estado de la cuenta se mira después de la contraseña: a quien no la sabe
   * no le confirmamos que el correo existe.
   */
  it('no distingue una cuenta desactivada de una contraseña incorrecta', async () => {
    const user = await userDoc({ isActive: false });

    await expect(
      service(user).login({ email: 'ana@acme.com', password: 'otra-cosa' }),
    ).rejects.toThrow('Credenciales inválidas');
  });
});

describe('AuthService.refresh — cuentas desactivadas', () => {
  const refreshToken = 'el-refresh-token';

  async function withSession(overrides: Partial<UserDocument> = {}) {
    return userDoc({
      refreshTokenHash: await bcrypt.hash(refreshToken, 10),
      ...overrides,
    });
  }

  it('renueva la sesión de una cuenta activa', async () => {
    const result = await service(await withSession()).refresh(
      'user-1',
      refreshToken,
    );

    expect(result.accessToken).toBe('un-token');
  });

  /** Sin esto, una sesión abierta antes de la baja se renovaría para siempre. */
  it('corta la renovación de una cuenta desactivada', async () => {
    const user = await withSession({
      isActive: false,
    });

    await expect(
      service(user).refresh('user-1', refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
