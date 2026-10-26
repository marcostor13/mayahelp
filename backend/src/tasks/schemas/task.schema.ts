import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type TaskDocument = HydratedDocument<Task>;

@Schema({ timestamps: true })
export class Task {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  agent: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: Date, default: null })
  dueAt: Date | null;

  @Prop({ default: false })
  done: boolean;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
