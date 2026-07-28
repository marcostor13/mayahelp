import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProjectShareLinkDocument = HydratedDocument<ProjectShareLink>;

@Schema({ timestamps: true })
export class ProjectShareLink {
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  project: Types.ObjectId;

  /** Opaque random token — never the Mongo _id, to avoid guessable/enumerable public URLs. */
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ trim: true })
  label?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ default: 0 })
  usageCount: number;

  declare createdAt: Date;
}

export const ProjectShareLinkSchema =
  SchemaFactory.createForClass(ProjectShareLink);
