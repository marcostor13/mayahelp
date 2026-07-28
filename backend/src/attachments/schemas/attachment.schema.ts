import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AttachmentDocument = HydratedDocument<Attachment>;

export type AttachmentKind = 'image' | 'video' | 'audio' | 'document';

@Schema({ timestamps: true })
export class Attachment {
  @Prop({ type: Types.ObjectId, ref: 'Ticket', required: true, index: true })
  ticket: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  commentId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;

  @Prop({ required: true, trim: true })
  filename: string;

  @Prop({ required: true })
  mimetype: string;

  @Prop({
    type: String,
    enum: ['image', 'video', 'audio', 'document'],
    required: true,
  })
  kind: AttachmentKind;

  @Prop({ required: true })
  size: number;

  @Prop({ required: true })
  storageKey: string;

  @Prop({ required: true })
  url: string;

  declare createdAt: Date;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);
