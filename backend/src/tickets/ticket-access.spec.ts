import { ForbiddenException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { TicketsService } from './tickets.service';
import { TicketDocument } from './schemas/ticket.schema';
import { AttachmentDocument } from '../attachments/schemas/attachment.schema';
import { CountersService } from '../common/counters/counters.service';
import { TicketAutoReplyService } from './ticket-auto-reply.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';
import { TicketStatus } from '../common/enums/ticket.enum';

const CLIENT_ID = new Types.ObjectId();
const OTHER_CLIENT_ID = new Types.ObjectId();

function requester(role: Role, userId: string): AuthenticatedUser {
  return { userId, email: 'quien@acme.com', role, mustChangePassword: false };
}

/**
 * `findById` popula `client`, así que el ticket que llega al chequeo de acceso trae ahí
 * un documento de usuario, no un ObjectId. Este doble reproduce esa forma: es justo la
 * diferencia que hacía que el chequeo comparara mal.
 */
function populatedTicket(clientId: Types.ObjectId) {
  const client = {
    _id: clientId,
    name: 'Ana',
    email: 'ana@acme.com',
    // Un documento poblado imprime su contenido, no su id.
    toString: () =>
      `{ name: 'Ana', _id: new ObjectId('${clientId.toString()}') }`,
  };
  return {
    id: 't1',
    code: 'TCK-8001',
    subject: 'Asunto',
    client,
    status: TicketStatus.ABIERTO,
    comments: [],
    toObject: () => ({ code: 'TCK-8001', comments: [] }),
  } as unknown as TicketDocument;
}

function serviceFor(ticket: TicketDocument): TicketsService {
  const chain = {
    populate: () => chain,
    exec: () => Promise.resolve(ticket),
  };
  return new TicketsService(
    { findById: () => chain } as unknown as Model<TicketDocument>,
    {} as unknown as Model<AttachmentDocument>,
    {} as unknown as CountersService,
    {} as unknown as TicketAutoReplyService,
    {} as unknown as UsersService,
    {} as unknown as NotificationsService,
  );
}

describe('TicketsService.findById — acceso del cliente', () => {
  /** El caso que rompía en producción: el dueño recibía 403 sobre su propio ticket. */
  it('deja al dueño abrir su ticket aunque el cliente venga poblado', async () => {
    const service = serviceFor(populatedTicket(CLIENT_ID));

    await expect(
      service.findById('t1', requester(Role.CLIENT, CLIENT_ID.toString())),
    ).resolves.toMatchObject({ code: 'TCK-8001' });
  });

  it('sigue bloqueando el ticket de otra persona', async () => {
    const service = serviceFor(populatedTicket(OTHER_CLIENT_ID));

    await expect(
      service.findById('t1', requester(Role.CLIENT, CLIENT_ID.toString())),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('le deja al equipo abrir el ticket de cualquiera', async () => {
    const service = serviceFor(populatedTicket(OTHER_CLIENT_ID));

    await expect(
      service.findById('t1', requester(Role.AGENT, CLIENT_ID.toString())),
    ).resolves.toBeDefined();
  });

  /** Ante una forma que no reconoce, niega: nunca deja pasar por las dudas. */
  it('falla cerrado si la referencia al cliente no tiene id', async () => {
    const broken = {
      ...populatedTicket(CLIENT_ID),
      client: { name: 'Sin id' },
    } as unknown as TicketDocument;

    await expect(
      serviceFor(broken).findById(
        't1',
        requester(Role.CLIENT, CLIENT_ID.toString()),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** addComment lee el ticket sin poblar: ahí `client` es un ObjectId. */
  it('funciona igual cuando el cliente no viene poblado', async () => {
    const raw = {
      ...populatedTicket(CLIENT_ID),
      client: CLIENT_ID,
    } as unknown as TicketDocument;

    await expect(
      serviceFor(raw).findById(
        't1',
        requester(Role.CLIENT, CLIENT_ID.toString()),
      ),
    ).resolves.toBeDefined();
  });
});
