import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import { TicketEventType } from './schemas/ticket-event.schema';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { FilterTicketDto } from './dto/filter-ticket.dto';
import {
  buildTicketQuery,
  buildTicketSearchFallback,
  usesTextSearch,
} from './ticket-query';
import { CountersService } from '../common/counters/counters.service';
import { TicketAutoReplyService } from './ticket-auto-reply.service';
import { TicketEventsService } from './ticket-events.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';
import {
  TicketPriority,
  TicketSource,
  TicketStatus,
} from '../common/enums/ticket.enum';
import {
  Paginated,
  paginate,
  resolvePagination,
} from '../common/pagination/pagination';

const TICKET_COUNTER_KEY = 'ticket';
const TICKET_CODE_BASE = 8000;

/** The fields whose changes end up in the audit trail, as they were before an update. */
interface TicketSnapshot {
  status: TicketStatus;
  priority: TicketPriority;
  category: string | null;
  assignedAgent: string | null;
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    private readonly countersService: CountersService,
    private readonly autoReplyService: TicketAutoReplyService,
    private readonly eventsService: TicketEventsService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateTicketDto, requester: AuthenticatedUser) {
    const clientId =
      requester.role === Role.CLIENT ? requester.userId : dto.client;
    if (!clientId) {
      throw new ForbiddenException('Debes indicar el cliente del ticket');
    }
    const actor = await this.usersService.findById(requester.userId);
    return this.persistTicket({
      subject: dto.subject,
      description: dto.description,
      category: dto.category,
      clientId,
      priority: dto.priority,
      source: TicketSource.PORTAL,
      actorId: requester.userId,
      actorName: actor.name,
    });
  }

  /** Used by the unauthenticated public-observation flow — no requester/role checks apply. */
  async createFromExternalSource(params: {
    subject: string;
    description: string;
    category: string;
    clientId: string;
    projectId: string;
    actorName: string;
  }) {
    return this.persistTicket({
      ...params,
      source: TicketSource.PUBLIC_LINK,
      actorId: null,
    });
  }

  private async persistTicket(params: {
    subject: string;
    description: string;
    category: string;
    clientId: string;
    priority?: TicketPriority;
    projectId?: string;
    source: TicketSource;
    actorId: string | null;
    actorName: string;
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
      source: params.source,
    });

    await this.eventsService.record({
      ticketId: ticket.id,
      actorId: params.actorId,
      actorName: params.actorName,
      type: TicketEventType.CREATED,
      to: params.source,
    });

    const client = await this.usersService.findById(params.clientId);
    this.dispatch(
      this.notificationsService.notifyTicketCreated(
        { name: client.name, email: client.email, phone: client.phone },
        { _id: ticket.id, code: ticket.code, subject: ticket.subject },
      ),
      `ticket creado ${ticket.code}`,
    );

    await this.autoReplyService.maybeReply(ticket);
    return ticket;
  }

  async findAll(
    filter: FilterTicketDto,
    requester: AuthenticatedUser,
  ): Promise<Paginated<TicketDocument>> {
    const pagination = resolvePagination(filter);
    const query = buildTicketQuery(filter, requester);

    let [items, total] = await Promise.all([
      this.runListQuery(query, pagination.skip, pagination.limit),
      this.ticketModel.countDocuments(query).exec(),
    ]);

    // $text only matches whole words. When it comes up empty and the user was
    // plainly typing a prefix, retry with the (unindexed) substring search.
    if (total === 0 && usesTextSearch(filter)) {
      const fallback = buildTicketSearchFallback(filter, requester);
      [items, total] = await Promise.all([
        this.runListQuery(fallback, pagination.skip, pagination.limit),
        this.ticketModel.countDocuments(fallback).exec(),
      ]);
    }

    return paginate(items, total, pagination);
  }

  private runListQuery(
    query: Record<string, unknown>,
    skip: number,
    limit: number,
  ) {
    return this.ticketModel
      .find(query)
      .select('-comments')
      .populate('client', 'name email company')
      .populate('category', 'name icon')
      .populate('assignedAgent', 'name email')
      .populate('project', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
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

  async findEvents(id: string, requester: AuthenticatedUser) {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }
    this.assertAccess(ticket, requester);
    return this.eventsService.findByTicket(id);
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

    const before: TicketSnapshot = {
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category?.toString() ?? null,
      assignedAgent: ticket.assignedAgent?.toString() ?? null,
    };
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

    const actor = await this.usersService.findById(requester.userId);
    await this.recordUpdateEvents(ticket, before, requester.userId, actor.name);

    if (statusChanged) {
      const client = await this.usersService.findById(ticket.client.toString());
      this.dispatch(
        this.notificationsService.notifyStatusChanged(
          { name: client.name, email: client.email, phone: client.phone },
          { _id: ticket.id, code: ticket.code, subject: ticket.subject },
          ticket.status,
        ),
        `cambio de estado ${ticket.code}`,
      );
    }
    return ticket;
  }

  private async recordUpdateEvents(
    ticket: TicketDocument,
    before: TicketSnapshot,
    actorId: string,
    actorName: string,
  ): Promise<void> {
    const base = { ticketId: ticket.id, actorId, actorName };

    if (ticket.status !== before.status) {
      await this.eventsService.record({
        ...base,
        type: TicketEventType.STATUS_CHANGED,
        from: before.status,
        to: ticket.status,
      });
    }
    if (ticket.priority !== before.priority) {
      await this.eventsService.record({
        ...base,
        type: TicketEventType.PRIORITY_CHANGED,
        from: before.priority,
        to: ticket.priority,
      });
    }

    const categoryNow = ticket.category?.toString() ?? null;
    if (categoryNow !== before.category) {
      await this.eventsService.record({
        ...base,
        type: TicketEventType.CATEGORY_CHANGED,
        from: before.category,
        to: categoryNow,
      });
    }

    const agentNow = ticket.assignedAgent?.toString() ?? null;
    if (agentNow !== before.assignedAgent) {
      // Names, not ids, on both sides: the trail is read by humans, and an agent
      // deleted later would otherwise leave an unresolvable id behind.
      await this.eventsService.record({
        ...base,
        type: agentNow ? TicketEventType.ASSIGNED : TicketEventType.UNASSIGNED,
        from: before.assignedAgent
          ? await this.safeUserName(before.assignedAgent)
          : null,
        to: agentNow ? await this.safeUserName(agentNow) : null,
      });
    }
  }

  private async safeUserName(userId: string): Promise<string> {
    try {
      const user = await this.usersService.findById(userId);
      return user.name;
    } catch {
      return userId;
    }
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

    await this.eventsService.record({
      ticketId: ticket.id,
      actorId: requester.userId,
      actorName: author.name,
      type: TicketEventType.COMMENTED,
    });

    if (requester.role === Role.CLIENT) {
      if (ticket.assignedAgent) {
        const agent = await this.usersService.findById(
          ticket.assignedAgent.toString(),
        );
        this.dispatch(
          this.notificationsService.notifyNewComment(
            { name: agent.name, email: agent.email, phone: agent.phone },
            { _id: ticket.id, code: ticket.code, subject: ticket.subject },
            author.name,
            message,
          ),
          `comentario ${ticket.code}`,
        );
      }
      await this.autoReplyService.maybeReply(ticket);
    } else {
      const client = await this.usersService.findById(ticket.client.toString());
      this.dispatch(
        this.notificationsService.notifyNewComment(
          { name: client.name, email: client.email, phone: client.phone },
          { _id: ticket.id, code: ticket.code, subject: ticket.subject },
          author.name,
          message,
        ),
        `comentario ${ticket.code}`,
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

  /**
   * Notifications go out after the response instead of blocking it: a slow Resend or
   * Meta call used to add its full latency to creating a ticket or posting a comment.
   */
  private dispatch(operation: Promise<void>, context: string): void {
    void operation.catch((error: unknown) =>
      this.logger.warn(
        `No se pudo enviar la notificación (${context}): ${(error as Error).message}`,
      ),
    );
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
