import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TicketEvent,
  TicketEventDocument,
  TicketEventType,
} from './schemas/ticket-event.schema';

export interface RecordEventInput {
  ticketId: string;
  actorId?: string | null;
  actorName: string;
  type: TicketEventType;
  from?: string | null;
  to?: string | null;
}

@Injectable()
export class TicketEventsService {
  private readonly logger = new Logger(TicketEventsService.name);

  constructor(
    @InjectModel(TicketEvent.name)
    private readonly eventModel: Model<TicketEventDocument>,
  ) {}

  /**
   * Best-effort: an audit write must never be the reason a ticket operation fails.
   * A lost trail entry is bad; a 500 on "change status" because of one is worse.
   */
  async record(input: RecordEventInput): Promise<void> {
    try {
      await this.eventModel.create({
        ticket: new Types.ObjectId(input.ticketId),
        actor: input.actorId ? new Types.ObjectId(input.actorId) : null,
        actorName: input.actorName,
        type: input.type,
        from: input.from ?? null,
        to: input.to ?? null,
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo registrar el evento ${input.type} del ticket ${input.ticketId}: ${(error as Error).message}`,
      );
    }
  }

  findByTicket(ticketId: string) {
    return this.eventModel
      .find({ ticket: new Types.ObjectId(ticketId) })
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
  }
}
