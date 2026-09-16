import { ForbiddenException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { TicketsService } from './tickets.service';
import { UserDocument } from '../users/schemas/user.schema';
import { ProjectAccessService } from '../common/project-access/project-access.service';
import { TicketDocument } from './schemas/ticket.schema';
import { AttachmentDocument } from '../attachments/schemas/attachment.schema';
import { CountersService } from '../common/counters/counters.service';
import { TicketAutoReplyService } from './ticket-auto-reply.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';
import { TicketStatus } from '../common/enums/ticket.enum';

const CLIENT_ID = new Types.ObjectId().toString();
const PROJECT_A = new Types.ObjectId();
const PROJECT_B = new Types.ObjectId();

/** El recorte tal cual lo arma `ProjectAccessService`. */
function projectScope(projects: Types.ObjectId[]) {
  return {
    $and: [{ $or: [{ project: null }, { project: { $in: projects } }] }],
  };
}
const OTHER_CLIENT_ID = new Types.ObjectId().toString();

/**
 * Captura el filtro con el que `findAll` consulta Mongo, que es donde se decide qué
 * tickets ve cada rol.
 */
function capturingService(assignedProjects: Types.ObjectId[] = []) {
  // Se guarda a mano en vez de con jest.fn() para que el filtro salga tipado.
  let captured: Record<string, unknown> | undefined;
  const chain = {
    sort: () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            populate: () => ({
              lean: () => ({ exec: () => Promise.resolve([]) }),
            }),
          }),
        }),
      }),
    }),
  };

  const service = new TicketsService(
    {
      find: (filter: Record<string, unknown>) => {
        captured = filter;
        return chain;
      },
    } as unknown as Model<TicketDocument>,
    {} as unknown as Model<AttachmentDocument>,
    {} as unknown as CountersService,
    {} as unknown as TicketAutoReplyService,
    {} as unknown as UsersService,
    {} as unknown as NotificationsService,
    accessWith(assignedProjects),
  );

  return { service, filterFor: () => captured };
}

function requester(
  role: Role,
  userId: string,
  isSuperAdmin = false,
): AuthenticatedUser {
  return {
    userId,
    email: 'quien@acme.com',
    role,
    isSuperAdmin,
    mustChangePassword: false,
  };
}

/** `ProjectAccessService` real (no un stub) sobre un usuario con estos proyectos. */
function accessWith(projects: Types.ObjectId[] = []): ProjectAccessService {
  return new ProjectAccessService({
    findById: () => ({
      lean: () => ({ exec: () => Promise.resolve({ projects }) }),
    }),
  } as unknown as Model<UserDocument>);
}

describe('TicketsService.findAll — qué ve cada rol', () => {
  it('al cliente le muestra sus propios tickets', async () => {
    const { service, filterFor } = capturingService();

    await service.findAll({}, requester(Role.CLIENT, CLIENT_ID));

    expect(filterFor()).toEqual({ client: CLIENT_ID });
  });

  /** Un cliente no puede espiar los de otro pasando ?client= en la URL. */
  it('ignora el filtro de cliente que mande un cliente', async () => {
    const { service, filterFor } = capturingService();

    await service.findAll(
      { client: OTHER_CLIENT_ID },
      requester(Role.CLIENT, CLIENT_ID),
    );

    expect(filterFor()).toEqual({ client: CLIENT_ID });
  });

  it('le deja al cliente combinar sus filtros con el suyo propio', async () => {
    const { service, filterFor } = capturingService();

    await service.findAll(
      { status: TicketStatus.ABIERTO },
      requester(Role.CLIENT, CLIENT_ID),
    );

    expect(filterFor()).toEqual({
      client: CLIENT_ID,
      status: TicketStatus.ABIERTO,
    });
  });

  it('al equipo no le restringe por cliente', async () => {
    const { service, filterFor } = capturingService([PROJECT_A]);

    await service.findAll({}, requester(Role.AGENT, 'staff-1'));

    expect(filterFor()).toEqual(projectScope([PROJECT_A]));
  });

  it('y le respeta el filtro de cliente cuando lo pide', async () => {
    const { service, filterFor } = capturingService([PROJECT_A]);

    await service.findAll(
      { client: OTHER_CLIENT_ID },
      requester(Role.ADMIN, 'staff-1'),
    );

    expect(filterFor()).toEqual({
      ...projectScope([PROJECT_A]),
      client: OTHER_CLIENT_ID,
    });
  });
});

/**
 * El recorte por proyecto se suma al de rol: el equipo ve los tickets de los proyectos
 * que tiene asignados, más los que no tienen proyecto (el buzón general de siempre).
 */
describe('TicketsService.findAll — recorte por proyecto', () => {
  it('acota al equipo a sus proyectos asignados y al buzón general', async () => {
    const { service, filterFor } = capturingService([PROJECT_A, PROJECT_B]);

    await service.findAll({}, requester(Role.AGENT, 'staff-1'));

    expect(filterFor()).toEqual(projectScope([PROJECT_A, PROJECT_B]));
  });

  it('a un agente sin asignaciones solo le deja el buzón general', async () => {
    const { service, filterFor } = capturingService([]);

    await service.findAll({}, requester(Role.AGENT, 'staff-1'));

    expect(filterFor()).toEqual(projectScope([]));
  });

  it('al súper usuario no le recorta nada', async () => {
    const { service, filterFor } = capturingService([]);

    await service.findAll({}, requester(Role.ADMIN, 'staff-1', true));

    expect(filterFor()).toEqual({});
  });

  /** El cliente ya está acotado a lo suyo; recortarlo además le escondería tickets propios. */
  it('al cliente lo deja con sus propios tickets, sin recorte por proyecto', async () => {
    const { service, filterFor } = capturingService([]);

    await service.findAll({}, requester(Role.CLIENT, CLIENT_ID));

    expect(filterFor()).toEqual({ client: CLIENT_ID });
  });

  it('deja filtrar por un proyecto asignado', async () => {
    const { service, filterFor } = capturingService([PROJECT_A]);

    await service.findAll(
      { project: PROJECT_A.toString() },
      requester(Role.AGENT, 'staff-1'),
    );

    expect(filterFor()).toEqual({
      ...projectScope([PROJECT_A]),
      project: PROJECT_A.toString(),
    });
  });

  it('rechaza el filtro por un proyecto que no tiene asignado', async () => {
    const { service } = capturingService([PROJECT_A]);

    await expect(
      service.findAll(
        { project: PROJECT_B.toString() },
        requester(Role.AGENT, 'staff-1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
