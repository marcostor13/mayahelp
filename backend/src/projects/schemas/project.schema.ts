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

  /** Every observation submitted through this project's public link(s) is filed under this category. */
  @Prop({ type: Types.ObjectId, ref: 'Category', required: true })
  defaultCategory: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

ProjectSchema.index({ status: 1, createdAt: -1 });
ProjectSchema.index({ client: 1 });
