import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { UserDocument } from './schemas/user.schema';
import { TicketDocument } from '../tickets/schemas/ticket.schema';
import { ProjectShareLinkDocument } from '../projects/schemas/project-share-link.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../common/enums/role.enum';

/** Solo hace falta `superAdminEmail`; ninguno de estos casos toca la cuenta dueña. */
function configService(superAdminEmail = 'duenio@mayahelp.com') {
  return {
    get: (key: string) =>
      key === 'superAdminEmail' ? superAdminEmail : undefined,
  } as unknown as ConfigService;
}

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

    const result = await service.resetPassword('user-1');

    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(8);
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
      bcrypt.compare(result.temporaryPassword, changes.$set.passwordHash),
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

    await expect(service.resetPassword('user-1')).resolves.toMatchObject({
      emailSent: false,
    });
  });

  it('rechaza resetear la cuenta del agente IA', async () => {
    const { service, update } = harness({
      found: userDoc({ isAiAgent: true }),
    });

    await expect(service.resetPassword('user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
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

    await service.update('user-1', { isActive: false });

    expect(setRefreshToken).toHaveBeenCalledWith('user-1', {
      refreshTokenHash: null,
    });
  });

  it('no toca la sesión al reactivar ni en una edición cualquiera', async () => {
    const { service, setRefreshToken } = updateHarness(activeUser());

    await service.update('user-1', { isActive: true });
    await service.update('user-1', { name: 'Ana María' });

    expect(setRefreshToken).not.toHaveBeenCalled();
  });
});
