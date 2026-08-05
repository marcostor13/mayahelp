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
import { Role } from '../common/enums/role.enum';
import { TicketPriority, TicketStatus } from '../common/enums/ticket.enum';

const TICKET_COUNTER_KEY = 'ticket';
const TICKET_CODE_BASE = 8000;

/** First line of the description, trimmed to a sensible subject length. */
function subjectFromDescription(description: string): string {
  const firstLine = description.split('\n')[0].trim();
  return firstLine.length > 90 ? `${firstLine.slice(0, 89)}…` : firstLine;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  ) {}

  async create(dto: CreateTicketDto, requester: AuthenticatedUser) {
    const clientId =
      requester.role === Role.CLIENT ? requester.userId : dto.client;
    if (!clientId) {
      throw new ForbiddenException('Debes indicar el cliente del ticket');
    }
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
    const tickets = await this.queryTickets(filter, requester)
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
    return this.queryTickets(filter, requester)
      .populate('client', 'name email company')
      .populate('category', 'name icon')
      .populate('assignedAgent', 'name email')
      .populate('project', 'name')
      .populate('comments.author', 'name role')
      .exec();
  }

  private queryTickets(filter: FilterTicketDto, requester: AuthenticatedUser) {
    const query: QueryFilter<TicketDocument> = {};

    if (requester.role === Role.CLIENT) {
      query.client = requester.userId;
    } else if (filter.client) {
      query.client = filter.client;
    }
    if (filter.status) query.status = filter.status;
    if (filter.priority) query.priority = filter.priority;
    if (filter.category) query.category = filter.category;
    if (filter.project) query.project = filter.project;
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

    return this.ticketModel.find(query).sort({ [sortField]: direction });
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
    this.assertAccess(ticket, requester);

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
      throw new ForbiddenException(
        'No tienes permiso para modificar este ticket',
      );
    }

    const statusChanged = Boolean(dto.status) && dto.status !== ticket.status;

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
      const client = await this.usersService.findById(ticket.client.toString());
      await this.notificationsService.notifyStatusChanged(
        this.recipientFrom(client),
        await this.buildNotifyTicket(ticket),
        ticket.status,
      );
    }
    return ticket;
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
    this.assertAccess(ticket, requester);

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
          ticket.assignedAgent.toString(),
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
      const client = await this.usersService.findById(ticket.client.toString());
      await this.notificationsService.notifyNewComment(
        this.recipientFrom(client),
        await this.buildNotifyTicket(ticket),
        author.name,
        message,
      );
    }
    return ticket;
  }

  async remove(id: string) {
    const result = await this.ticketModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Ticket no encontrado');
    }
  }

  private assertAccess(ticket: TicketDocument, requester: AuthenticatedUser) {
    if (
      requester.role === Role.CLIENT &&
      ticket.client.toString() !== requester.userId
    ) {
      throw new ForbiddenException('No tienes permiso para ver este ticket');
    }
  }
}
