import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { UserDocument } from './schemas/user.schema';
import { TicketDocument } from '../tickets/schemas/ticket.schema';
import { ProjectShareLinkDocument } from '../projects/schemas/project-share-link.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectAccessService } from '../common/project-access/project-access.service';
import { Role } from '../common/enums/role.enum';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

/** Solo hace falta `superAdminEmail`; ninguno de estos casos toca la cuenta dueña. */
function configService(superAdminEmail = 'duenio@mayahelp.com') {
  return {
    get: (key: string) =>
      key === 'superAdminEmail' ? superAdminEmail : undefined,
  } as unknown as ConfigService;
}

/** Otro admin del equipo: puede administrar cuentas, pero no la del dueño. */
const ADMIN: AuthenticatedUser = {
  userId: 'admin-2',
  email: 'admin@acme.com',
  role: Role.ADMIN,
  isSuperAdmin: false,
  mustChangePassword: false,
};

const OWNER: AuthenticatedUser = {
  ...ADMIN,
  userId: 'owner',
  email: 'duenio@mayahelp.com',
  isSuperAdmin: true,
};

function userDoc(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    id: 'user-1',
    name: 'Ana',
    email: 'ana@acme.com',
    role: Role.CLIENT,
    isAiAgent: false,
    mustChangePassword: false,
    save: () => Promise.resolve(),
    ...overrides,
  } as unknown as UserDocument;
}

interface Harness {
  service: UsersService;
  update: jest.Mock;
  notify: jest.Mock;
}

function harness(params: {
  found?: UserDocument | null;
  updated?: UserDocument | null;
  withPassword?: UserDocument | null;
  emailSent?: boolean;
}): Harness {
  const update = jest.fn().mockReturnValue({
    exec: () => Promise.resolve(params.updated ?? null),
  });
  const notify = jest.fn().mockResolvedValue(params.emailSent ?? true);

  const userModel = {
    findById: jest.fn().mockReturnValue({
      exec: () => Promise.resolve(params.found ?? null),
      select: () => ({
        exec: () => Promise.resolve(params.withPassword ?? null),
      }),
    }),
    findByIdAndUpdate: update,
  } as unknown as Model<UserDocument>;

  const service = new UsersService(
    userModel,
    {} as unknown as Model<TicketDocument>,
    {} as unknown as Model<ProjectShareLinkDocument>,
    {} as unknown as Model<ProjectDocument>,
    { notifyPasswordReset: notify } as unknown as NotificationsService,
    configService(),
    {} as unknown as ProjectAccessService,
  );
  return { service, update, notify };
}

describe('UsersService.resetPassword', () => {
  it('genera una temporal, marca el cambio obligatorio y borra el refresh token', async () => {
    const updated = userDoc({
      mustChangePassword: true,
    });
    const { service, update, notify } = harness({
      found: userDoc(),
      updated,
    });

    const result = await service.resetPassword('user-1', ADMIN);

    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(result.temporaryPassword!.length).toBeGreaterThanOrEqual(8);
    expect(result.emailSent).toBe(true);

    const [, changes] = update.mock.calls[0] as [
      string,
      {
        $set: { passwordHash: string; mustChangePassword: boolean };
        $unset: Record<string, number>;
      },
    ];
    expect(changes.$set.mustChangePassword).toBe(true);
    expect(changes.$unset).toEqual({ refreshTokenHash: 1 });
    // La temporal se guarda hasheada, nunca en claro.
    expect(changes.$set.passwordHash).not.toBe(result.temporaryPassword);
    await expect(
      bcrypt.compare(result.temporaryPassword!, changes.$set.passwordHash),
    ).resolves.toBe(true);

    expect(notify).toHaveBeenCalledWith(
      { name: 'Ana', email: 'ana@acme.com' },
      result.temporaryPassword,
    );
  });

  /** El admin necesita saberlo para pasar la contraseña por otra vía. */
  it('reporta emailSent en false cuando el correo no sale', async () => {
    const { service } = harness({
      found: userDoc(),
      updated: userDoc(),
      emailSent: false,
    });

    await expect(service.resetPassword('user-1', ADMIN)).resolves.toMatchObject(
      {
        emailSent: false,
      },
    );
  });

  it('rechaza resetear la cuenta del agente IA', async () => {
    const { service, update } = harness({
      found: userDoc({ isAiAgent: true }),
    });

    await expect(service.resetPassword('user-1', ADMIN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  /**
   * Si la temporal volviera en la respuesta, cualquier admin se quedaba con la cuenta
   * dueña: la pide, la recibe y entra.
   */
  it('si otro admin resetea al súper usuario, la temporal va solo a su correo', async () => {
    const owner = userDoc({ isSuperAdmin: true, email: 'duenio@mayahelp.com' });
    const { service, update, notify } = harness({
      found: owner,
      updated: owner,
    });

    const result = await service.resetPassword('user-1', ADMIN);

    expect(result.temporaryPassword).toBeUndefined();
    expect(result.emailSent).toBe(true);
    const [recipient, emailed] = notify.mock.calls[0] as [
      { email: string },
      string,
    ];
    expect(recipient.email).toBe('duenio@mayahelp.com');
    // Lo que se guardó es lo que le llegó por correo.
    const [, changes] = update.mock.calls[0] as [
      string,
      { $set: { passwordHash: string } },
    ];
    await expect(
      bcrypt.compare(emailed, changes.$set.passwordHash),
    ).resolves.toBe(true);
  });

  /** Sin "olvidé mi contraseña", cambiarla sin poder avisarle lo dejaría afuera. */
  it('si el correo al súper usuario no sale, su contraseña no cambia', async () => {
    const { service, update } = harness({
      found: userDoc({ isSuperAdmin: true }),
      emailSent: false,
    });

    await expect(service.resetPassword('user-1', ADMIN)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('el súper usuario sí ve la temporal de su propio reseteo', async () => {
    const owner = userDoc({ isSuperAdmin: true });
    const { service } = harness({ found: owner, updated: owner });

    const result = await service.resetPassword('user-1', OWNER);

    expect(result.temporaryPassword).toEqual(expect.any(String));
  });
});

describe('UsersService.changePassword', () => {
  async function withStoredPassword(current: string) {
    const stored = userDoc({
      passwordHash: await bcrypt.hash(current, 10),
      mustChangePassword: true,
    });
    // El mock se guarda aparte: leerlo desde el documento desprende el `this` del método.
    const save = jest.fn().mockResolvedValue(stored);
    stored.save = save;
    return { stored, save, ...harness({ withPassword: stored }) };
  }

  it('cambia la contraseña y limpia el flag del reseteo', async () => {
    const { service, stored, save } = await withStoredPassword('temporal1');

    await service.changePassword('user-1', 'temporal1', 'mi-clave-nueva');

    expect(stored.mustChangePassword).toBe(false);
    await expect(
      bcrypt.compare('mi-clave-nueva', stored.passwordHash),
    ).resolves.toBe(true);
    expect(save).toHaveBeenCalled();
  });

  it('rechaza una contraseña actual incorrecta', async () => {
    const { service, save } = await withStoredPassword('temporal1');

    await expect(
      service.changePassword('user-1', 'otra-cosa', 'mi-clave-nueva'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(save).not.toHaveBeenCalled();
  });

  it('rechaza repetir la contraseña actual', async () => {
    const { service, save } = await withStoredPassword('temporal1');

    await expect(
      service.changePassword('user-1', 'temporal1', 'temporal1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('UsersService.update — baja de cuenta', () => {
  function updateHarness(user: UserDocument) {
    const setRefreshToken = jest.fn().mockReturnValue({
      exec: () => Promise.resolve(null),
    });
    const userModel = {
      findById: () => ({ exec: () => Promise.resolve(user) }),
      findByIdAndUpdate: setRefreshToken,
    } as unknown as Model<UserDocument>;

    const service = new UsersService(
      userModel,
      {} as unknown as Model<TicketDocument>,
      {} as unknown as Model<ProjectShareLinkDocument>,
      {} as unknown as Model<ProjectDocument>,
      {} as unknown as NotificationsService,
      configService(),
      {} as unknown as ProjectAccessService,
    );
    return { service, setRefreshToken };
  }

  function activeUser() {
    const save = jest.fn().mockImplementation(function (this: UserDocument) {
      return Promise.resolve(this);
    });
    const user = userDoc({
      isActive: true,
      notifications: { email: true, whatsapp: true },
      save,
    });
    return user;
  }

  /** Desactivar tiene que cortar lo que ya está abierto, no solo los logins nuevos. */
  it('borra el refresh token al desactivar la cuenta', async () => {
    const { service, setRefreshToken } = updateHarness(activeUser());

    await service.update('user-1', { isActive: false }, ADMIN);

    expect(setRefreshToken).toHaveBeenCalledWith('user-1', {
      refreshTokenHash: null,
    });
  });

  it('no toca la sesión al reactivar ni en una edición cualquiera', async () => {
    const { service, setRefreshToken } = updateHarness(activeUser());

    await service.update('user-1', { isActive: true }, ADMIN);
    await service.update('user-1', { name: 'Ana María' }, ADMIN);

    expect(setRefreshToken).not.toHaveBeenCalled();
  });
});
