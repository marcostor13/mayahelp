import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { FilterTicketDto } from './dto/filter-ticket.dto';
import { CountersService } from '../common/counters/counters.service';
import { TicketAutoReplyService } from './ticket-auto-reply.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';
import { TicketPriority, TicketStatus } from '../common/enums/ticket.enum';

const TICKET_COUNTER_KEY = 'ticket';
const TICKET_CODE_BASE = 8000;

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
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
      subject: dto.subject,
      description: dto.description,
      category: dto.category,
      clientId,
      priority: dto.priority,
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
      { name: client.name, email: client.email, phone: client.phone },
      { _id: ticket.id, code: ticket.code, subject: ticket.subject },
    );

    await this.autoReplyService.maybeReply(ticket);
    return ticket;
  }

  async findAll(filter: FilterTicketDto, requester: AuthenticatedUser) {
    const query: QueryFilter<TicketDocument> = {};

    if (requester.role === Role.CLIENT) {
      query.client = requester.userId;
    }
    if (filter.status) query.status = filter.status;
    if (filter.priority) query.priority = filter.priority;
    if (filter.category) query.category = filter.category;
    if (filter.project) query.project = filter.project;
    if (filter.search) {
      query.$or = [
        { subject: { $regex: filter.search, $options: 'i' } },
        { code: { $regex: filter.search, $options: 'i' } },
      ];
    }

    return this.ticketModel
      .find(query)
      .populate('client', 'name email company')
      .populate('category', 'name icon')
      .populate('assignedAgent', 'name email')
      .populate('project', 'name')
      .sort({ createdAt: -1 })
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
        { name: client.name, email: client.email, phone: client.phone },
        { _id: ticket.id, code: ticket.code, subject: ticket.subject },
        ticket.status,
      );
    }
    return ticket;
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
          { name: agent.name, email: agent.email, phone: agent.phone },
          { _id: ticket.id, code: ticket.code, subject: ticket.subject },
          author.name,
          message,
        );
      }
      await this.autoReplyService.maybeReply(ticket);
    } else {
      const client = await this.usersService.findById(ticket.client.toString());
      await this.notificationsService.notifyNewComment(
        { name: client.name, email: client.email, phone: client.phone },
        { _id: ticket.id, code: ticket.code, subject: ticket.subject },
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
