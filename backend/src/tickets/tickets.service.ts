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
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';
import { TicketStatus } from '../common/enums/ticket.enum';

const TICKET_COUNTER_KEY = 'ticket';
const TICKET_CODE_BASE = 8000;

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    private readonly countersService: CountersService,
    private readonly autoReplyService: TicketAutoReplyService,
  ) {}

  async create(dto: CreateTicketDto, requester: AuthenticatedUser) {
    const clientId =
      requester.role === Role.CLIENT ? requester.userId : dto.client;
    if (!clientId) {
      throw new ForbiddenException('Debes indicar el cliente del ticket');
    }
    const sequence = await this.countersService.next(TICKET_COUNTER_KEY);
    const code = `TCK-${TICKET_CODE_BASE + sequence}`;

    const ticket = await this.ticketModel.create({
      code,
      subject: dto.subject,
      description: dto.description,
      category: dto.category,
      client: clientId,
      priority: dto.priority,
    });

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
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string, requester: AuthenticatedUser) {
    const ticket = await this.ticketModel
      .findById(id)
      .populate('client', 'name email company')
      .populate('category', 'name icon')
      .populate('assignedAgent', 'name email')
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

    Object.assign(ticket, dto);
    if (
      dto.status &&
      [TicketStatus.RESUELTO, TicketStatus.CERRADO].includes(dto.status) &&
      !ticket.resolvedAt
    ) {
      ticket.resolvedAt = new Date();
    }
    await ticket.save();
    return ticket;
  }

  async addComment(id: string, message: string, requester: AuthenticatedUser) {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }
    this.assertAccess(ticket, requester);

    ticket.comments.push({
      author: new Types.ObjectId(requester.userId),
      authorName: requester.email,
      message,
      isInternal: false,
      createdAt: new Date(),
    });
    await ticket.save();

    if (requester.role === Role.CLIENT) {
      await this.autoReplyService.maybeReply(ticket);
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
