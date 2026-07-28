import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TicketPriority, TicketStatus } from '../../common/enums/ticket.enum';

export type TicketDocument = HydratedDocument<Ticket>;

@Schema()
export class TicketComment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true })
  authorName: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const TicketCommentSchema = SchemaFactory.createForClass(TicketComment);

@Schema({ timestamps: true })
export class Ticket {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true, trim: true })
  subject: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  client: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true })
  category: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedAgent: Types.ObjectId | null;

  @Prop({ type: String, enum: TicketStatus, default: TicketStatus.ABIERTO })
  status: TicketStatus;

  @Prop({ type: String, enum: TicketPriority, default: TicketPriority.MEDIA })
  priority: TicketPriority;

  @Prop({ type: [TicketCommentSchema], default: [] })
  comments: TicketComment[];

  @Prop({ type: Number, min: 1, max: 5, default: null })
  satisfaction: number | null;

  @Prop({ type: Date, default: null })
  resolvedAt: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);
