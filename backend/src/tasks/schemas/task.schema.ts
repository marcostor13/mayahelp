import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TaskDocument = HydratedDocument<Task>;

@Schema({ timestamps: true })
export class Task {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  agent: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: Date, default: null })
  dueAt: Date | null;

  @Prop({ default: false })
  done: boolean;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.index({ agent: 1, done: 1, dueAt: 1 });
