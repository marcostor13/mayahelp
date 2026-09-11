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

const CLIENT_ID = new Types.ObjectId().toString();
const OTHER_CLIENT_ID = new Types.ObjectId().toString();

/**
 * Captura el filtro con el que `findAll` consulta Mongo, que es donde se decide qué
 * tickets ve cada rol.
 */
function capturingService() {
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
  );

  return { service, filterFor: () => captured };
}

function requester(role: Role, userId: string): AuthenticatedUser {
  return { userId, email: 'quien@acme.com', role, mustChangePassword: false };
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
    const { service, filterFor } = capturingService();

    await service.findAll({}, requester(Role.AGENT, 'staff-1'));

    expect(filterFor()).toEqual({});
  });

  it('y le respeta el filtro de cliente cuando lo pide', async () => {
    const { service, filterFor } = capturingService();

    await service.findAll(
      { client: OTHER_CLIENT_ID },
      requester(Role.ADMIN, 'staff-1'),
    );

    expect(filterFor()).toEqual({ client: OTHER_CLIENT_ID });
  });
});
