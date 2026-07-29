import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TicketEventDocument = HydratedDocument<TicketEvent>;

export enum TicketEventType {
  CREATED = 'created',
  STATUS_CHANGED = 'status_changed',
  PRIORITY_CHANGED = 'priority_changed',
  CATEGORY_CHANGED = 'category_changed',
  ASSIGNED = 'assigned',
  UNASSIGNED = 'unassigned',
  COMMENTED = 'commented',
  AI_REPLIED = 'ai_replied',
}

/**
 * Append-only trail of what happened to a ticket. Kept in its own collection rather
 * than embedded so a long-lived ticket never grows its own document unbounded.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class TicketEvent {
  @Prop({ type: Types.ObjectId, ref: 'Ticket', required: true })
  ticket: Types.ObjectId;

  /** Null when the actor is not a logged-in user (public link, automation, cron). */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  actor: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  actorName: string;

  @Prop({ type: String, enum: TicketEventType, required: true })
  type: TicketEventType;

  @Prop({ type: String, default: null })
  from: string | null;

  @Prop({ type: String, default: null })
  to: string | null;

  declare createdAt: Date;
}

export const TicketEventSchema = SchemaFactory.createForClass(TicketEvent);

TicketEventSchema.index({ ticket: 1, createdAt: -1 });
