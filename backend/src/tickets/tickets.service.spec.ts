import { Model } from 'mongoose';
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

const AGENT: AuthenticatedUser = {
  userId: 'agent1',
  role: Role.AGENT,
} as AuthenticatedUser;

interface FakeTicket {
  id: string;
  code: string;
  status: TicketStatus;
  client: { toString(): string };
  resolvedAt: Date | null;
  save: () => Promise<void>;
}

function fakeTicket(id: string, status: TicketStatus): FakeTicket {
  return {
    id,
    code: `TCK-${id}`,
    status,
    client: { toString: () => 'client1' },
    resolvedAt: null,
    save: () => Promise.resolve(),
  };
}

interface Harness {
  service: TicketsService;
  notified: { code: string; status: TicketStatus }[];
}

function harness(tickets: FakeTicket[]): Harness {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const notified: { code: string; status: TicketStatus }[] = [];

  const ticketModel = {
    findById: (id: string) => ({
      exec: () => Promise.resolve(byId.get(id) ?? null),
      // Cadena que usa buildNotifyTicket para traer los nombres de categoría/proyecto.
      select: () => ({
        populate: () => ({
          populate: () => ({
            lean: () => ({ exec: () => Promise.resolve(null) }),
          }),
        }),
      }),
    }),
  } as unknown as Model<TicketDocument>;

  const notificationsService = {
    notifyStatusChanged: (
      _recipient: unknown,
      ticket: { code: string },
      status: TicketStatus,
    ) => {
      notified.push({ code: ticket.code, status });
      return Promise.resolve();
    },
  } as unknown as NotificationsService;

  const usersService = {
    findById: () => Promise.resolve({ name: 'Ana', email: 'ana@x.com' }),
  } as unknown as UsersService;

  const service = new TicketsService(
    ticketModel,
    {} as Model<AttachmentDocument>,
    {} as CountersService,
    {} as TicketAutoReplyService,
    usersService,
    notificationsService,
  );

  return { service, notified };
}

describe('TicketsService.updateStatusMany', () => {
  it('updates every ticket and notifies each client, like editing them one by one', async () => {
    const tickets = [
      fakeTicket('t1', TicketStatus.ABIERTO),
      fakeTicket('t2', TicketStatus.EN_PROCESO),
    ];
    const { service, notified } = harness(tickets);

    const updated = await service.updateStatusMany(
      ['t1', 't2'],
      TicketStatus.RESUELTO,
      AGENT,
    );

    expect(updated).toHaveLength(2);
    expect(tickets.map((ticket) => ticket.status)).toEqual([
      TicketStatus.RESUELTO,
      TicketStatus.RESUELTO,
    ]);
    // Resolver marca la fecha de resolución, igual que desde el detalle del ticket.
    expect(tickets[0].resolvedAt).toBeInstanceOf(Date);
    expect(notified).toEqual([
      { code: 'TCK-t1', status: TicketStatus.RESUELTO },
      { code: 'TCK-t2', status: TicketStatus.RESUELTO },
    ]);
  });

  it('skips ids that no longer exist instead of failing the whole batch', async () => {
    const tickets = [fakeTicket('t1', TicketStatus.ABIERTO)];
    const { service, notified } = harness(tickets);

    const updated = await service.updateStatusMany(
      ['t1', 'borrado'],
      TicketStatus.CERRADO,
      AGENT,
    );

    expect(updated).toHaveLength(1);
    expect(notified).toHaveLength(1);
  });

  it('does not notify a ticket that was already in that status', async () => {
    const { service, notified } = harness([
      fakeTicket('t1', TicketStatus.CERRADO),
    ]);

    await service.updateStatusMany(['t1'], TicketStatus.CERRADO, AGENT);

    expect(notified).toEqual([]);
  });
});
