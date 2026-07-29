import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  TicketPriority,
  TicketSource,
  TicketStatus,
} from '../../common/enums/ticket.enum';

export type TicketDocument = HydratedDocument<Ticket>;

@Schema()
export class TicketComment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true })
  authorName: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ default: false })
  isInternal: boolean;

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

  /** Set when the ticket was filed against a project (staff-tagged, or via a public observation link). */
  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  project: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedAgent: Types.ObjectId | null;

  @Prop({ type: String, enum: TicketStatus, default: TicketStatus.ABIERTO })
  status: TicketStatus;

  @Prop({ type: String, enum: TicketPriority, default: TicketPriority.MEDIA })
  priority: TicketPriority;

  /** Entry channel. Needed to measure channel adoption; never inferred after the fact. */
  @Prop({ type: String, enum: TicketSource, default: TicketSource.PORTAL })
  source: TicketSource;

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

// The list endpoint always sorts by createdAt desc, so every filter that has its
// own index pairs it with createdAt to serve sort and filter from one index.
TicketSchema.index({ createdAt: -1 });
TicketSchema.index({ client: 1, createdAt: -1 });
TicketSchema.index({ status: 1, createdAt: -1 });
TicketSchema.index({ assignedAgent: 1, status: 1, createdAt: -1 });
TicketSchema.index({ category: 1, createdAt: -1 });
TicketSchema.index({ project: 1, createdAt: -1 });
TicketSchema.index({ priority: 1, createdAt: -1 });

// Mongo allows a single text index per collection, so subject/description/comments
// share one. Weights make a hit in the subject outrank one buried in a comment.
TicketSchema.index(
  { subject: 'text', description: 'text', 'comments.message': 'text' },
  {
    name: 'ticket_text_search',
    default_language: 'spanish',
    weights: { subject: 10, description: 4, 'comments.message': 1 },
  },
);
