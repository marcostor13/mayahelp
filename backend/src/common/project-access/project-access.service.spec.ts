import { ForbiddenException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { ProjectAccessService } from './project-access.service';
import { UserDocument } from '../../users/schemas/user.schema';
import { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import { Role } from '../enums/role.enum';

const PROJECT_A = new Types.ObjectId();
const PROJECT_B = new Types.ObjectId();

/** El modelo solo se usa para leer `projects` de la cuenta que hace el request. */
function serviceWith(projects: Types.ObjectId[] | undefined) {
  const userModel = {
    findById: () => ({
      lean: () => ({
        exec: () =>
          Promise.resolve(projects === undefined ? null : { projects }),
      }),
    }),
  } as unknown as Model<UserDocument>;
  return new ProjectAccessService(userModel);
}

function requester(role: Role, isSuperAdmin = false): AuthenticatedUser {
  return {
    userId: 'user-1',
    email: 'quien@acme.com',
    role,
    isSuperAdmin,
    mustChangePassword: false,
  };
}

describe('ProjectAccessService', () => {
  it('al súper usuario no le filtra nada', async () => {
    const service = serviceWith([]);

    expect(
      await service.visibleProjectIds(requester(Role.ADMIN, true)),
    ).toBeNull();
    expect(await service.projectIdFilter(requester(Role.ADMIN, true))).toEqual(
      {},
    );
    expect(
      await service.canAccess(requester(Role.ADMIN, true), PROJECT_A),
    ).toBe(true);
  });

  /** El rol no alcanza: un admin común ve lo que le asignaron y nada más. */
  it('acota al admin común a sus proyectos asignados', async () => {
    const service = serviceWith([PROJECT_A]);

    expect(await service.visibleProjectIds(requester(Role.ADMIN))).toEqual([
      PROJECT_A.toString(),
    ]);
    expect(await service.canAccess(requester(Role.ADMIN), PROJECT_A)).toBe(
      true,
    );
    expect(await service.canAccess(requester(Role.ADMIN), PROJECT_B)).toBe(
      false,
    );
  });

  it('a una cuenta sin asignaciones no le muestra ningún proyecto', async () => {
    const service = serviceWith([]);

    expect(await service.projectIdFilter(requester(Role.CLIENT))).toEqual({
      _id: { $in: [] },
    });
    expect(await service.canAccess(requester(Role.CLIENT), PROJECT_A)).toBe(
      false,
    );
  });

  it('arma el filtro sobre el campo que referencia al proyecto', async () => {
    const service = serviceWith([PROJECT_A, PROJECT_B]);

    expect(
      await service.referenceFilter(requester(Role.AGENT), 'project'),
    ).toEqual({ project: { $in: [PROJECT_A, PROJECT_B] } });
  });

  it('rechaza el acceso a un proyecto que no está asignado', async () => {
    const service = serviceWith([PROJECT_A]);

    await expect(
      service.assertAccess(requester(Role.AGENT), PROJECT_B),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertAccess(requester(Role.AGENT), PROJECT_A),
    ).resolves.toBeUndefined();
  });

  /** Sin proyecto (por ejemplo un ticket suelto) tampoco hay acceso salvo súper usuario. */
  it('trata la falta de proyecto como sin acceso', async () => {
    const service = serviceWith([PROJECT_A]);

    expect(await service.canAccess(requester(Role.AGENT), null)).toBe(false);
    expect(await service.canAccess(requester(Role.ADMIN, true), null)).toBe(
      true,
    );
  });
});
