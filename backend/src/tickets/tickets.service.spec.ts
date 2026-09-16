import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { TicketsService } from './tickets.service';
import { ProjectAccessService } from '../common/project-access/project-access.service';
import { UserDocument } from '../users/schemas/user.schema';
import { TicketDocument } from './schemas/ticket.schema';
import { AttachmentDocument } from '../attachments/schemas/attachment.schema';
import { CountersService } from '../common/counters/counters.service';
import { TicketAutoReplyService } from './ticket-auto-reply.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';
import { TicketPriority, TicketStatus } from '../common/enums/ticket.enum';

const CLIENT_ID = new Types.ObjectId().toString();
const OTHER_CLIENT_ID = new Types.ObjectId().toString();

function requester(role: Role, userId = CLIENT_ID): AuthenticatedUser {
  return {
    userId,
    email: 'quien@acme.com',
    role,
    isSuperAdmin: false,
    mustChangePassword: false,
  };
}

/**
 * Devuelve el `save` aparte del documento: leerlo desde el objeto en los `expect`
 * desprende el `this` del método y el lint lo rechaza.
 */
function scenario(overrides: Partial<Record<string, unknown>> = {}) {
  const save = jest.fn();
  const ticket = {
    id: 't1',
    code: 'TCK-8001',
    subject: 'Asunto original',
    description: 'Descripción original del problema',
    client: new Types.ObjectId(CLIENT_ID),
    status: TicketStatus.ABIERTO,
    priority: TicketPriority.MEDIA,
    resolvedAt: null,
    save,
    ...overrides,
  } as unknown as TicketDocument;

  return { ticket, save, service: serviceFor(ticket) };
}

function serviceFor(
  ticket: TicketDocument | null,
  deps: { users?: UsersService; notifications?: NotificationsService } = {},
): TicketsService {
  // `findById` sirve a dos usos: el documento crudo del update, y la cadena
  // .select().populate().lean().exec() con la que buildNotifyTicket arma el aviso.
  const ticketModel = {
    findById: () => ({
      exec: () => Promise.resolve(ticket),
      select: () => ({
        populate: () => ({
          populate: () => ({
            lean: () => ({
              exec: () =>
                Promise.resolve({
                  category: { name: 'Soporte' },
                  project: null,
                }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as Model<TicketDocument>;

  return new TicketsService(
    ticketModel,
    {} as unknown as Model<AttachmentDocument>,
    {} as unknown as CountersService,
    {} as unknown as TicketAutoReplyService,
    deps.users ?? ({} as unknown as UsersService),
    deps.notifications ?? ({} as unknown as NotificationsService),
    accessWith(),
  );
}

/** `ProjectAccessService` real (no un stub) sobre un usuario con estos proyectos. */
function accessWith(projects: Types.ObjectId[] = []): ProjectAccessService {
  return new ProjectAccessService({
    findById: () => ({
      lean: () => ({ exec: () => Promise.resolve({ projects }) }),
    }),
  } as unknown as Model<UserDocument>);
}

describe('TicketsService.update — permisos del cliente', () => {
  it('deja al cliente editar su propio ticket abierto', async () => {
    const { service, ticket, save } = scenario();

    await service.update(
      't1',
      { subject: 'Asunto corregido', description: 'Ahora con más detalle' },
      requester(Role.CLIENT),
    );

    expect(ticket.subject).toBe('Asunto corregido');
    expect(ticket.description).toBe('Ahora con más detalle');
    expect(save).toHaveBeenCalled();
  });

  it('también le deja cambiar categoría y prioridad', async () => {
    const { service, ticket } = scenario();

    await service.update(
      't1',
      {
        category: new Types.ObjectId().toString(),
        priority: TicketPriority.ALTA,
      },
      requester(Role.CLIENT),
    );

    expect(ticket.priority).toBe(TicketPriority.ALTA);
  });

  it.each([
    TicketStatus.EN_PROCESO,
    TicketStatus.RESUELTO,
    TicketStatus.CERRADO,
  ])('bloquea la edición cuando el ticket está %s', async (status) => {
    const { service, save } = scenario({ status });

    await expect(
      service.update(
        't1',
        { subject: 'Ya no se puede' },
        requester(Role.CLIENT),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(save).not.toHaveBeenCalled();
  });

  it('bloquea el ticket de otro cliente', async () => {
    const { service, save } = scenario();

    await expect(
      service.update(
        't1',
        { subject: 'Ticket ajeno' },
        requester(Role.CLIENT, OTHER_CLIENT_ID),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(save).not.toHaveBeenCalled();
  });

  /** El estado y el agente son del flujo del equipo, no del cliente. */
  it.each([
    ['el estado', { status: TicketStatus.CERRADO }],
    ['el agente', { assignedAgent: new Types.ObjectId().toString() }],
  ])('rechaza que el cliente cambie %s', async (_campo, dto) => {
    const { service, save } = scenario();

    await expect(
      service.update('t1', dto, requester(Role.CLIENT)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(save).not.toHaveBeenCalled();
  });

  it('rechaza un campo permitido si viene junto a uno prohibido', async () => {
    const { service, ticket, save } = scenario();

    await expect(
      service.update(
        't1',
        { subject: 'Asunto nuevo', status: TicketStatus.CERRADO },
        requester(Role.CLIENT),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ticket.subject).toBe('Asunto original');
    expect(save).not.toHaveBeenCalled();
  });

  it('responde 404 sobre un ticket que no existe', async () => {
    await expect(
      serviceFor(null).update(
        't1',
        { subject: 'Nada' },
        requester(Role.CLIENT),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /** El equipo sigue editando con las reglas de siempre: sin límite de estado ni de dueño. */
  it('no aplica ninguna de estas restricciones a un agente', async () => {
    const { service, ticket, save } = scenario({
      status: TicketStatus.CERRADO,
      client: new Types.ObjectId(OTHER_CLIENT_ID),
    });

    await service.update(
      't1',
      { subject: 'Corregido por el agente' },
      requester(Role.AGENT, new Types.ObjectId().toString()),
    );

    expect(ticket.subject).toBe('Corregido por el agente');
    expect(save).toHaveBeenCalled();
  });
});

describe('TicketsService.update — aviso al agente asignado', () => {
  const AGENT_ID = new Types.ObjectId().toString();

  function withAgent(overrides: Record<string, unknown> = {}) {
    const save = jest.fn();
    const ticket = {
      id: 't1',
      code: 'TCK-8001',
      subject: 'Asunto original',
      description: 'Descripción original del problema',
      client: new Types.ObjectId(CLIENT_ID),
      assignedAgent: new Types.ObjectId(AGENT_ID),
      status: TicketStatus.ABIERTO,
      priority: TicketPriority.MEDIA,
      resolvedAt: null,
      save,
      ...overrides,
    } as unknown as TicketDocument;

    const notifyTicketEdited = jest.fn().mockResolvedValue(undefined);
    const users = {
      findById: (id: string) =>
        Promise.resolve({
          id,
          name: id === AGENT_ID ? 'Agente Ana' : 'Cliente Beto',
          email: `${id}@acme.com`,
          notifications: { email: true, whatsapp: true },
        }),
    } as unknown as UsersService;

    return {
      ticket,
      notifyTicketEdited,
      service: serviceFor(ticket, {
        users,
        notifications: {
          notifyTicketEdited,
        } as unknown as NotificationsService,
      }),
    };
  }

  it('le avisa al agente qué cambió el cliente', async () => {
    const { service, notifyTicketEdited } = withAgent();

    await service.update(
      't1',
      { subject: 'Asunto corregido' },
      requester(Role.CLIENT),
    );

    expect(notifyTicketEdited).toHaveBeenCalledTimes(1);
    const [recipient, , editorName, changes] = notifyTicketEdited.mock
      .calls[0] as [
      { name: string },
      unknown,
      string,
      Array<{ field: string; from: string; to: string }>,
    ];
    expect(recipient.name).toBe('Agente Ana');
    expect(editorName).toBe('Cliente Beto');
    expect(changes).toEqual([
      {
        field: 'subject',
        label: 'Asunto',
        from: 'Asunto original',
        to: 'Asunto corregido',
      },
    ]);
  });

  /** Guardar sin tocar nada no tiene por qué molestar a nadie. */
  it('no avisa cuando el cliente guarda los mismos valores', async () => {
    const { service, notifyTicketEdited } = withAgent();

    await service.update(
      't1',
      { subject: 'Asunto original', priority: TicketPriority.MEDIA },
      requester(Role.CLIENT),
    );

    expect(notifyTicketEdited).not.toHaveBeenCalled();
  });

  it('no avisa si el ticket todavía no tiene agente', async () => {
    const { service, notifyTicketEdited } = withAgent({ assignedAgent: null });

    await service.update(
      't1',
      { subject: 'Asunto corregido' },
      requester(Role.CLIENT),
    );

    expect(notifyTicketEdited).not.toHaveBeenCalled();
  });

  /** El equipo ya ve sus propios cambios; el aviso es para cuando edita el cliente. */
  it('no avisa cuando el que edita es un agente', async () => {
    const { service, notifyTicketEdited } = withAgent();

    await service.update(
      't1',
      { subject: 'Asunto corregido' },
      requester(Role.AGENT, AGENT_ID),
    );

    expect(notifyTicketEdited).not.toHaveBeenCalled();
  });
});
