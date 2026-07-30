import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProjectStatus =
  'planning' | 'in_progress' | 'on_hold' | 'completed';
export type ProjectDocument = HydratedDocument<Project>;

@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: ['planning', 'in_progress', 'on_hold', 'completed'],
    default: 'in_progress',
  })
  status: ProjectStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  client: Types.ObjectId | null;

  /** Optional suggestion pre-selected in the public form; the reporter always picks the final category. */
  @Prop({ type: Types.ObjectId, ref: 'Category', default: null })
  defaultCategory: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
