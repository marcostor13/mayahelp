import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { TicketDocument } from '../tickets/schemas/ticket.schema';
import { ProjectShareLinkDocument } from '../projects/schemas/project-share-link.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectAccessService } from '../common/project-access/project-access.service';
import { Role } from '../common/enums/role.enum';

const EMAIL = 'ana@acme.com';

/**
 * Una "base" mínima que guarda de verdad el hash que le escriben, para poder encadenar
 * el reseteo con el login como pasa en producción. bcrypt corre de verdad: es el único
 * modo de comprobar que la contraseña que se muestra en pantalla es la que abre sesión.
 */
function fakeDb() {
  const stored: Record<string, unknown> = {
    _id: 'u1',
    id: 'u1',
    name: 'Ana',
    email: EMAIL,
    role: Role.CLIENT,
    isActive: true,
    isSuperAdmin: false,
    isAiAgent: false,
    mustChangePassword: false,
    passwordHash: 'hash-viejo',
  };

  const userModel = {
    findById: () => ({ exec: () => Promise.resolve(stored as UserDocument) }),
    findByIdAndUpdate: (_id: string, update: Record<string, never>) => {
      Object.assign(stored, update.$set ?? {});
      for (const key of Object.keys(update.$unset ?? {})) delete stored[key];
      return { exec: () => Promise.resolve(stored as UserDocument) };
    },
    findOne: () => ({
      select: () => ({ exec: () => Promise.resolve(stored as UserDocument) }),
    }),
  } as unknown as Model<UserDocument>;

  return { stored, userModel };
}

function services(userModel: Model<UserDocument>) {
  const users = new UsersService(
    userModel,
    {} as unknown as Model<TicketDocument>,
    {} as unknown as Model<ProjectShareLinkDocument>,
    {} as unknown as Model<ProjectDocument>,
    {
      notifyPasswordReset: () => Promise.resolve(true),
    } as unknown as NotificationsService,
    { get: () => '' } as unknown as ConfigService,
    {} as unknown as ProjectAccessService,
  );

  const auth = new AuthService(
    users,
    { signAsync: () => Promise.resolve('token') } as unknown as JwtService,
    { get: () => 'secreto' } as unknown as ConfigService,
  );

  return { users, auth };
}

describe('Reseteo y login encadenados', () => {
  it('la contraseña temporal que se muestra es la que abre sesión', async () => {
    const { userModel } = fakeDb();
    const { users, auth } = services(userModel);

    const { temporaryPassword } = await users.resetPassword('u1');
    const result = await auth.login({
      email: EMAIL,
      password: temporaryPassword,
    });

    expect(result.user.email).toBe(EMAIL);
    expect(result.accessToken).toBeDefined();
  });

  /** Entra en estado "tenés que elegir una propia", no directo a la plataforma. */
  it('la sesión queda marcada para cambiar la contraseña', async () => {
    const { userModel } = fakeDb();
    const { users, auth } = services(userModel);

    const { temporaryPassword } = await users.resetPassword('u1');
    const result = await auth.login({
      email: EMAIL,
      password: temporaryPassword,
    });

    expect(result.user.mustChangePassword).toBe(true);
  });

  it('la contraseña vieja deja de servir', async () => {
    const { userModel, stored } = fakeDb();
    const { users, auth } = services(userModel);
    // Una contraseña real anterior, para que el rechazo sea por el reseteo y no por
    // comparar contra un hash inventado.
    stored.passwordHash = await bcrypt.hash('la-vieja', 10);

    await users.resetPassword('u1');

    await expect(
      auth.login({ email: EMAIL, password: 'la-vieja' }),
    ).rejects.toThrow('Credenciales inválidas');
  });

  /** El espacio de más al pegar desde el correo es un 401 legítimo, no un bug. */
  it('una temporal con un espacio pegado de más no entra', async () => {
    const { userModel } = fakeDb();
    const { users, auth } = services(userModel);

    const { temporaryPassword } = await users.resetPassword('u1');

    await expect(
      auth.login({ email: EMAIL, password: `${temporaryPassword} ` }),
    ).rejects.toThrow('Credenciales inválidas');
  });
});
