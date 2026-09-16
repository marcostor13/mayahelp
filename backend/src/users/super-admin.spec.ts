import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { UsersService } from './users.service';
import { UserDocument } from './schemas/user.schema';
import { TicketDocument } from '../tickets/schemas/ticket.schema';
import { ProjectShareLinkDocument } from '../projects/schemas/project-share-link.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../common/enums/role.enum';

const OWNER_EMAIL = 'marcostor13@gmail.com';
const PROJECT_A = new Types.ObjectId();
const PROJECT_B = new Types.ObjectId();

function config() {
  return {
    get: (key: string) => (key === 'superAdminEmail' ? OWNER_EMAIL : undefined),
  } as unknown as ConfigService;
}

function userDoc(overrides: Partial<UserDocument> = {}): UserDocument {
  const doc = {
    id: 'user-1',
    name: 'Ana',
    email: 'ana@acme.com',
    role: Role.CLIENT,
    isSuperAdmin: false,
    isActive: true,
    projects: [],
    notifications: { email: true, whatsapp: true },
    markModified: () => undefined,
    ...overrides,
  } as unknown as UserDocument;
  doc.save = () => Promise.resolve(doc);
  return doc;
}

/** `existingProjects` son los ids que la base reconoce al validar una asignación. */
function harness(params: {
  found?: UserDocument | null;
  created?: Record<string, unknown>;
  existingProjects?: Types.ObjectId[];
}) {
  const create = jest
    .fn()
    .mockImplementation((doc: Record<string, unknown>) =>
      Promise.resolve(userDoc(doc as Partial<UserDocument>)),
    );
  const deleteById = jest
    .fn()
    .mockReturnValue({ exec: () => Promise.resolve(null) });

  const userModel = {
    findOne: () => Promise.resolve(null),
    create,
    findById: () => ({ exec: () => Promise.resolve(params.found ?? null) }),
    findByIdAndDelete: deleteById,
    findByIdAndUpdate: () => ({ exec: () => Promise.resolve(null) }),
  } as unknown as Model<UserDocument>;

  const projectModel = {
    find: (filter: { _id: { $in: string[] } }) => ({
      lean: () => ({
        exec: () =>
          Promise.resolve(
            (params.existingProjects ?? [])
              .filter((id) => filter._id.$in.includes(id.toString()))
              .map((id) => ({ _id: id })),
          ),
      }),
    }),
  } as unknown as Model<ProjectDocument>;

  const service = new UsersService(
    userModel,
    {} as unknown as Model<TicketDocument>,
    {} as unknown as Model<ProjectShareLinkDocument>,
    projectModel,
    {} as unknown as NotificationsService,
    config(),
  );
  return { service, create, deleteById };
}

describe('UsersService — súper usuario', () => {
  it('crea la cuenta dueña como admin con el flag puesto, aunque pidan otro rol', async () => {
    const { service, create } = harness({});

    await service.createWithPassword({
      name: 'Marcos',
      email: ' MarcosTor13@Gmail.com ',
      role: Role.CLIENT,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: OWNER_EMAIL,
        role: Role.ADMIN,
        isSuperAdmin: true,
      }),
    );
  });

  it('cualquier otra cuenta se crea sin el flag y con el rol pedido', async () => {
    const { service, create } = harness({});

    await service.createWithPassword({
      name: 'Ana',
      email: 'ana@acme.com',
      role: Role.AGENT,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.AGENT, isSuperAdmin: false }),
    );
  });

  it('no deja bajarle el rol al súper usuario', async () => {
    const { service } = harness({
      found: userDoc({ isSuperAdmin: true, role: Role.ADMIN }),
    });

    await expect(
      service.update('user-1', { role: Role.AGENT }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no deja desactivar al súper usuario', async () => {
    const { service } = harness({
      found: userDoc({ isSuperAdmin: true, role: Role.ADMIN }),
    });

    await expect(
      service.update('user-1', { isActive: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no deja eliminar al súper usuario', async () => {
    const { service, deleteById } = harness({
      found: userDoc({ isSuperAdmin: true, role: Role.ADMIN }),
    });

    await expect(service.remove('user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(deleteById).not.toHaveBeenCalled();
  });

  /** Al resto sí: el resguardo es solo para la cuenta dueña. */
  it('elimina cualquier otra cuenta', async () => {
    const { service, deleteById } = harness({ found: userDoc() });

    await service.remove('user-1');

    expect(deleteById).toHaveBeenCalledWith('user-1');
  });
});

describe('UsersService.setProjects', () => {
  it('guarda los proyectos asignados', async () => {
    const user = userDoc();
    const { service } = harness({
      found: user,
      existingProjects: [PROJECT_A, PROJECT_B],
    });

    const saved = await service.setProjects('user-1', [
      PROJECT_A.toString(),
      PROJECT_B.toString(),
    ]);

    expect(saved.projects).toEqual([PROJECT_A, PROJECT_B]);
  });

  it('vacía la lista cuando no se manda ninguno', async () => {
    const user = userDoc({ projects: [PROJECT_A] });
    const { service } = harness({ found: user, existingProjects: [PROJECT_A] });

    const saved = await service.setProjects('user-1', []);

    expect(saved.projects).toEqual([]);
  });

  /** Asignar un proyecto borrado dejaría una referencia muerta e invisible. */
  it('rechaza un proyecto que ya no existe', async () => {
    const { service } = harness({
      found: userDoc(),
      existingProjects: [PROJECT_A],
    });

    await expect(
      service.setProjects('user-1', [
        PROJECT_A.toString(),
        PROJECT_B.toString(),
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
