import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ConnectionStatus } from './project-connection.schema';

export type MonitorCheckDocument = HydratedDocument<MonitorCheck>;

/** Metrics are open-ended: each connection type reports what it can measure. */
export type CheckMetrics = Record<string, number | string | boolean | null>;

@Schema({ timestamps: { createdAt: 'checkedAt', updatedAt: false } })
export class MonitorCheck {
  @Prop({
    type: Types.ObjectId,
    ref: 'ProjectConnection',
    required: true,
    index: true,
  })
  connection: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  project: Types.ObjectId;

  @Prop({ type: String, enum: ConnectionStatus, required: true })
  status: ConnectionStatus;

  @Prop({ type: Number, default: null })
  latencyMs: number | null;

  @Prop({ type: Object, default: {} })
  metrics: CheckMetrics;

  @Prop({ trim: true })
  error?: string;

  declare checkedAt: Date;
}

export const MonitorCheckSchema = SchemaFactory.createForClass(MonitorCheck);

// History is for trends, not forensics: drop samples after 30 days so the collection
// cannot grow without bound on a small deployment.
MonitorCheckSchema.index(
  { checkedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);
MonitorCheckSchema.index({ connection: 1, checkedAt: -1 });
