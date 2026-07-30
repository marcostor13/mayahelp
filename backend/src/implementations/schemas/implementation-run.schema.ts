import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ImplementationRunDocument = ImplementationRun & Document;

export enum RunStatus {
  /** Dispatched to GitHub; the workflow has not reported back yet. */
  QUEUED = 'queued',
  /** The workflow called back to say Claude Code is working. */
  RUNNING = 'running',
  /** Claude Code opened a pull request; waiting for checks (and maybe the merge). */
  PR_OPEN = 'pr_open',
  MERGED = 'merged',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/** A run stops being polled once it reaches one of these. */
export const TERMINAL_STATUSES: RunStatus[] = [
  RunStatus.MERGED,
  RunStatus.FAILED,
  RunStatus.CANCELLED,
];

@Schema({ timestamps: true, collection: 'implementationruns' })
export class ImplementationRun {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  })
  project: Types.ObjectId;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Ticket' }],
    default: [],
  })
  tickets: Types.ObjectId[];

  /** Denormalised so the run stays readable even if a ticket is deleted later. */
  @Prop({ type: [String], default: [] })
  ticketCodes: string[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  requestedBy?: Types.ObjectId;

  @Prop({ trim: true })
  requestedByName?: string;

  @Prop({ required: true, trim: true })
  title: string;

  /**
   * Short random key that ties this run to the branch the workflow creates
   * (`mayahelp/<runKey>-...`) and authenticates its callback.
   */
  @Prop({ required: true, unique: true, index: true })
  runKey: string;

  @Prop({
    type: String,
    enum: RunStatus,
    default: RunStatus.QUEUED,
    index: true,
  })
  status: RunStatus;

  /** Whether this run was asked to merge on green. Snapshotted at dispatch time. */
  @Prop({ default: false })
  autoMerge: boolean;

  @Prop() branch?: string;
  @Prop() prNumber?: number;
  @Prop() prUrl?: string;
  @Prop() workflowUrl?: string;
  @Prop() summary?: string;
  @Prop() lastError?: string;

  /** How many checks are green / total, refreshed by the poller. */
  @Prop() checksPassed?: number;
  @Prop() checksTotal?: number;

  @Prop() dispatchedAt?: Date;
  @Prop() finishedAt?: Date;
  @Prop() mergedAt?: Date;

  /** The Markdown handed to Claude Code, kept so a run can be audited or repeated. */
  @Prop({ default: '' })
  prompt: string;
}

export const ImplementationRunSchema =
  SchemaFactory.createForClass(ImplementationRun);

ImplementationRunSchema.index({ project: 1, createdAt: -1 });
