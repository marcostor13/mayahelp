import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import {
  Attachment,
  AttachmentDocument,
} from '../attachments/schemas/attachment.schema';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import {
  FilterTicketDto,
  SortOrder,
  TicketSortField,
} from './dto/filter-ticket.dto';
import { CountersService } from '../common/counters/counters.service';
import { TicketAutoReplyService } from './ticket-auto-reply.service';
import { UsersService } from '../users/users.service';
import {
  NotificationsService,
  NotifyRecipient,
  NotifyTicket,
} from '../notifications/notifications.service';
import { UserDocument } from '../users/schemas/user.schema';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ProjectAccessService } from '../common/project-access/project-access.service';
import { Role } from '../common/enums/role.enum';
import { TicketPriority, TicketStatus } from '../common/enums/ticket.enum';
import { describeTicketChanges } from './ticket-changes';

const TICKET_COUNTER_KEY = 'ticket';
const TICKET_CODE_BASE = 8000;

/**
 * Lo único que un cliente puede tocar de su propio ticket. Queda fuera todo lo que
 * define el flujo de trabajo del equipo: el estado y el agente asignado.
 */
const CLIENT_EDITABLE_FIELDS: ReadonlySet<keyof UpdateTicketDto> = new Set([
  'subject',
  'description',
  'category',
  'priority',
]);

/** First line of the description, trimmed to a sensible subject length. */
function subjectFromDescription(description: string): string {
  const firstLine = description.split('\n')[0].trim();
  return firstLine.length > 90 ? `${firstLine.slice(0, 89)}…` : firstLine;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Id de una referencia, venga poblada o no.
 *
 * `findById` popula `client`, así que ahí no hay un ObjectId sino un documento de
 * usuario, y su `toString()` imprime el contenido ("{ name: 'Ana', _id: ... }") en vez
 * del id. Comparar eso contra el id del token daba siempre distinto: el dueño recibía
 * 403 sobre su propio ticket. Leer `_id` funciona en los dos casos — un ObjectId
 * también lo expone, y devuelve su propio hex.
 */
function refId(reference: unknown): string {
  if (!reference) return '';
  if (typeof reference === 'string') return reference;
  if (reference instanceof Types.ObjectId) return reference.toHexString();
  const id = (reference as { _id?: unknown })._id;
  // Ante una forma inesperada devuelve '', que no coincide con ningún id: el chequeo
  // de acceso falla cerrado, negando en vez de dejar pasar.
  return id instanceof Types.ObjectId ? id.toHexString() : '';
}

/**
 * Proyecto del ticket para el chequeo de acceso. `null` es "sin proyecto" — el buzón
 * general, que ve todo el equipo. Ojo: `findById` popula `project`, así que ahí hay un
 * documento y no un ObjectId (ver `refId`). Una referencia presente que no se puede
 * resolver devuelve un id imposible en vez de `null`, para que el chequeo falle cerrado
 * en lugar de confundirse con un ticket sin proyecto.
 */
function ticketProjectId(ticket: TicketDocument): string | null {
  if (!ticket.project) return null;
  return refId(ticket.project) || 'referencia-de-proyecto-irresoluble';
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(Attachment.name)
    private attachmentModel: Model<AttachmentDocument>,
    private readonly countersService: CountersService,
    private readonly autoReplyService: TicketAutoReplyService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly access: ProjectAccessService,
  ) {}

  async create(dto: CreateTicketDto, requester: AuthenticatedUser) {
    const clientId =
      requester.role === Role.CLIENT ? requester.userId : dto.client;
    if (!clientId) {
      throw new ForbiddenException('Debes indicar el cliente del ticket');
    }
    await this.access.assertTicketAccess(requester, dto.project);
    return this.persistTicket({
      subject: dto.subject?.trim() || subjectFromDescription(dto.description),
      description: dto.description,
      category: dto.category,
      clientId,
      priority: dto.priority,
      projectId: dto.project,
    });
  }

  /** Used by the unauthenticated public-observation flow — no requester/role checks apply. */
  async createFromExternalSource(params: {
    subject: string;
    description: string;
    category: string;
    clientId: string;
    projectId: string;
  }) {
    return this.persistTicket(params);
  }

  private async persistTicket(params: {
    subject: string;
    description: string;
    category: string;
    clientId: string;
    priority?: TicketPriority;
    projectId?: string;
  }) {
    const sequence = await this.countersService.next(TICKET_COUNTER_KEY);
    const code = `TCK-${TICKET_CODE_BASE + sequence}`;

    const ticket = await this.ticketModel.create({
      code,
      subject: params.subject,
      description: params.description,
      category: params.category,
      client: params.clientId,
      priority: params.priority,
      project: params.projectId ?? null,
    });

    const client = await this.usersService.findById(params.clientId);
    await this.notificationsService.notifyTicketCreated(
      this.recipientFrom(client),
      await this.buildNotifyTicket(ticket),
    );

    await this.autoReplyService.maybeReply(ticket);
    return ticket;
  }

  /** Recipient payload including the per-user notification opt-out. */
  private recipientFrom(user: UserDocument): NotifyRecipient {
    return {
      name: user.name,
      email: user.email,
      phone: user.phone,
      notifications: {
        email: user.notifications?.email,
        whatsapp: user.notifications?.whatsapp,
      },
    };
  }

  /**
   * Notification payload with the names (category, project) the configurable WhatsApp
   * template variables can reference — the raw document only holds their ids.
   */
  private async buildNotifyTicket(
    ticket: TicketDocument,
  ): Promise<NotifyTicket> {
    const populated = await this.ticketModel
      .findById(ticket.id)
      .select('code subject description status priority category project')
      .populate<{ category?: { name?: string } }>('category', 'name')
      .populate<{ project?: { name?: string } }>('project', 'name')
      .lean()
      .exec();

    return {
      _id: ticket.id,
      code: ticket.code,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      categoryName: populated?.category?.name,
      projectName: populated?.project?.name,
    };
  }

  /**
   * Ticket list for the UI. Returns plain objects enriched with `commentsCount` /
   * `attachmentsCount` so the table can show activity without a request per row.
   */
  async findAll(filter: FilterTicketDto, requester: AuthenticatedUser) {
    const { query, sort } = await this.ticketQuery(filter, requester);
    const tickets = await this.ticketModel
      .find(query)
      .sort(sort)
      .populate('client', 'name email company phone')
      .populate('category', 'name icon')
      .populate('assignedAgent', 'name email')
      .populate('project', 'name')
      .lean()
      .exec();

    const counts = await this.countAttachmentsByTicket(
      tickets.map((ticket) => ticket._id.toString()),
    );

    return tickets.map((ticket) => ({
      ...ticket,
      commentsCount: ticket.comments?.length ?? 0,
      attachmentsCount: counts.get(ticket._id.toString()) ?? 0,
      comments: undefined,
    }));
  }

  /** Same filter/order semantics as `findAll`, but fully populated for the Markdown export. */
  async findAllForExport(
    filter: FilterTicketDto,
    requester: AuthenticatedUser,
  ) {
    const { query, sort } = await this.ticketQuery(filter, requester);
    return this.ticketModel
      .find(query)
      .sort(sort)
      .populate('client', 'name email company')
      .populate('category', 'name icon')
      .populate('assignedAgent', 'name email')
      .populate('project', 'name')
      .populate('comments.author', 'name role')
      .exec();
  }

  /**
   * Filtro y orden de la lista de tickets, que es donde se decide qué ve cada rol.
   *
   * Devuelve datos y no un `Query` a propósito: un `Query` de Mongoose es thenable, así
   * que `await` sobre una función async que lo devolviera ejecutaría la consulta antes
   * de que el caller pudiera encadenarle sus `populate`.
   */
  private async ticketQuery(
    filter: FilterTicketDto,
    requester: AuthenticatedUser,
  ): Promise<{
    query: QueryFilter<TicketDocument>;
    sort: Record<string, 1 | -1>;
  }> {
    // Acota a los proyectos asignados; para el cliente y el súper usuario viene vacío.
    const query: QueryFilter<TicketDocument> =
      await this.access.ticketScopeFilter(requester);

    if (requester.role === Role.CLIENT) {
      query.client = requester.userId;
    } else if (filter.client) {
      query.client = filter.client;
    }
    if (filter.status) query.status = filter.status;
    if (filter.priority) query.priority = filter.priority;
    if (filter.category) query.category = filter.category;
    if (filter.project) {
      await this.access.assertTicketAccess(requester, filter.project);
      query.project = filter.project;
    }
    if (filter.unassigned === 'true') {
      query.assignedAgent = null;
    } else if (filter.assignedAgent) {
      query.assignedAgent = filter.assignedAgent;
    }
    if (filter.search) {
      // Escaped: a user typing "(" must not blow up the query with an invalid regex.
      const term = escapeRegex(filter.search);
      query.$or = [
        { subject: { $regex: term, $options: 'i' } },
        { code: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
      ];
    }

    const sortField = filter.sort ?? TicketSortField.CREATED_AT;
    const direction = filter.order === SortOrder.ASC ? 1 : -1;

    return { query, sort: { [sortField]: direction } };
  }

  private async countAttachmentsByTicket(
    ticketIds: string[],
  ): Promise<Map<string, number>> {
    if (ticketIds.length === 0) {
      return new Map();
    }
    const rows = await this.attachmentModel
      .aggregate<{ _id: Types.ObjectId; total: number }>([
        {
          $match: {
            ticket: { $in: ticketIds.map((id) => new Types.ObjectId(id)) },
          },
        },
        { $group: { _id: '$ticket', total: { $sum: 1 } } },
      ])
      .exec();
    return new Map(rows.map((row) => [row._id.toString(), row.total]));
  }

  async findById(id: string, requester: AuthenticatedUser) {
    const ticket = await this.ticketModel
      .findById(id)
      .populate('client', 'name email company')
      .populate('category', 'name icon')
      .populate('assignedAgent', 'name email')
      .populate('project', 'name')
      .populate('comments.author', 'name role')
      .exec();

    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }
    await this.assertAccess(ticket, requester);

    if (requester.role === Role.CLIENT) {
      const plain = ticket.toObject();
      plain.comments = plain.comments.filter((comment) => !comment.isInternal);
      return plain;
    }
    return ticket;
  }

  async update(id: string, dto: UpdateTicketDto, requester: AuthenticatedUser) {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }
    if (requester.role === Role.CLIENT) {
      this.assertClientCanEdit(ticket, dto, requester);
    }
    await this.assertAccess(ticket, requester);

    const statusChanged = Boolean(dto.status) && dto.status !== ticket.status;
    // Foto previa solo cuando hay a quién avisarle: es una consulta extra.
    const before =
      requester.role === Role.CLIENT && ticket.assignedAgent
        ? await this.buildNotifyTicket(ticket)
        : null;

    Object.assign(ticket, dto);
    if (
      dto.status &&
      [TicketStatus.RESUELTO, TicketStatus.CERRADO].includes(dto.status) &&
      !ticket.resolvedAt
    ) {
      ticket.resolvedAt = new Date();
    }
    await ticket.save();

    if (statusChanged) {
      const client = await this.usersService.findById(refId(ticket.client));
      await this.notificationsService.notifyStatusChanged(
        this.recipientFrom(client),
        await this.buildNotifyTicket(ticket),
        ticket.status,
      );
    }
    if (before) {
      await this.notifyAgentOfClientEdit(ticket, before, requester);
    }
    return ticket;
  }

  /**
   * El agente asignado puede estar trabajando sobre el pedido anterior, así que se le
   * avisa qué cambió. Al cliente no: el cambio es suyo.
   */
  private async notifyAgentOfClientEdit(
    ticket: TicketDocument,
    before: NotifyTicket,
    requester: AuthenticatedUser,
  ) {
    const after = await this.buildNotifyTicket(ticket);
    const changes = describeTicketChanges(before, after);
    if (changes.length === 0) {
      return;
    }
    const [agent, client] = await Promise.all([
      this.usersService.findById(refId(ticket.assignedAgent)),
      this.usersService.findById(requester.userId),
    ]);
    await this.notificationsService.notifyTicketEdited(
      this.recipientFrom(agent),
      after,
      client.name,
      changes,
    );
  }

  /** Applies the same status to several tickets, reusing `update` so notifications and resolvedAt stay consistent. */
  async updateManyStatus(
    ids: string[],
    status: TicketStatus,
    requester: AuthenticatedUser,
  ) {
    const tickets: TicketDocument[] = [];
    for (const id of ids) {
      tickets.push(await this.update(id, { status }, requester));
    }
    return tickets;
  }

  async addComment(id: string, message: string, requester: AuthenticatedUser) {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }
    await this.assertAccess(ticket, requester);

    const author = await this.usersService.findById(requester.userId);
    ticket.comments.push({
      author: new Types.ObjectId(requester.userId),
      authorName: author.name,
      message,
      isInternal: false,
      createdAt: new Date(),
    });
    await ticket.save();

    if (requester.role === Role.CLIENT) {
      if (ticket.assignedAgent) {
        const agent = await this.usersService.findById(
          refId(ticket.assignedAgent),
        );
        await this.notificationsService.notifyNewComment(
          this.recipientFrom(agent),
          await this.buildNotifyTicket(ticket),
          author.name,
          message,
        );
      }
      await this.autoReplyService.maybeReply(ticket);
    } else {
      const client = await this.usersService.findById(refId(ticket.client));
      await this.notificationsService.notifyNewComment(
        this.recipientFrom(client),
        await this.buildNotifyTicket(ticket),
        author.name,
        message,
      );
    }
    return ticket;
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }
    await this.assertAccess(ticket, requester);
    await this.ticketModel.findByIdAndDelete(id).exec();
  }

  /**
   * Un cliente edita su propio ticket mientras sigue abierto: una vez que el equipo
   * lo tomó, el contenido queda congelado y los cambios van por comentarios.
   */
  private assertClientCanEdit(
    ticket: TicketDocument,
    dto: UpdateTicketDto,
    requester: AuthenticatedUser,
  ) {
    if (refId(ticket.client) !== requester.userId) {
      throw new ForbiddenException(
        'No tienes permiso para modificar este ticket',
      );
    }
    if (ticket.status !== TicketStatus.ABIERTO) {
      throw new ForbiddenException(
        'Solo puedes editar el ticket mientras está abierto',
      );
    }
    const blocked = Object.keys(dto).filter(
      (field) => !CLIENT_EDITABLE_FIELDS.has(field as keyof UpdateTicketDto),
    );
    if (blocked.length > 0) {
      throw new ForbiddenException(
        'No puedes cambiar el estado ni el agente asignado del ticket',
      );
    }
  }

  private async assertAccess(
    ticket: TicketDocument,
    requester: AuthenticatedUser,
  ) {
    if (
      requester.role === Role.CLIENT &&
      refId(ticket.client) !== requester.userId
    ) {
      throw new ForbiddenException('No tienes permiso para ver este ticket');
    }
    await this.access.assertTicketAccess(requester, ticketProjectId(ticket));
  }
}
