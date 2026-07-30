import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ProjectRepoDocument = ProjectRepo & Document;

/**
 * Where a project's code lives and how MayaHelp asks Claude Code to work on it.
 * One repository per project: the tickets of a project always target the same codebase.
 */
@Schema({ timestamps: true, collection: 'projectrepos' })
export class ProjectRepo {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Project',
    required: true,
    unique: true,
    index: true,
  })
  project: Types.ObjectId;

  @Prop({ required: true, trim: true })
  owner: string;

  @Prop({ required: true, trim: true })
  repo: string;

  /** Branch the implementation branches off from, and the one that gets the merge. */
  @Prop({ default: 'main', trim: true })
  baseBranch: string;

  /** `repository_dispatch` event type the workflow listens to. */
  @Prop({ default: 'mayahelp-implement', trim: true })
  eventType: string;

  /** Extra context prepended to every prompt: stack, conventions, what not to touch. */
  @Prop({ default: '', trim: true })
  instructions: string;

  /**
   * Merge the pull request automatically once every check passes. Off by default:
   * with it on, code nobody read reaches production as soon as CI goes green.
   */
  @Prop({ default: false })
  autoMerge: boolean;

  @Prop({ default: true })
  isActive: boolean;

  /** Fine-grained PAT with contents+actions+pull-requests write. Encrypted at rest. */
  @Prop({ select: false })
  secretToken?: string;

  /** Shared secret the workflow signs its callback with. Encrypted at rest. */
  @Prop({ select: false })
  secretCallback?: string;

  @Prop()
  lastDispatchAt?: Date;

  @Prop()
  lastError?: string;
}

export const ProjectRepoSchema = SchemaFactory.createForClass(ProjectRepo);
