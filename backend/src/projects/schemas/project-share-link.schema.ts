import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: true })
export class ProjectReporter {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;
}

export const ProjectReporterSchema =
  SchemaFactory.createForClass(ProjectReporter);

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

  /** People staff pre-authorized to submit observations through this link — the public form has them pick from this list instead of typing their name/email. */
  @Prop({ type: [ProjectReporterSchema], default: [] })
  reporters: Types.DocumentArray<ProjectReporter>;

  declare createdAt: Date;
}

export const ProjectShareLinkSchema =
  SchemaFactory.createForClass(ProjectShareLink);
