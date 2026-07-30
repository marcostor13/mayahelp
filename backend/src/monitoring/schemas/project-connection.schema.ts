import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProjectConnectionDocument = HydratedDocument<ProjectConnection>;

/** Where a project is deployed; each type is probed differently. */
export enum ConnectionType {
  HTTP = 'http',
  SSH = 'ssh',
  RENDER = 'render',
  NETLIFY = 'netlify',
  COOLIFY = 'coolify',
}

export enum ConnectionStatus {
  UNKNOWN = 'unknown',
  UP = 'up',
  DEGRADED = 'degraded',
  DOWN = 'down',
}

/** Every alert an admin can switch on or off per connection. */
@Schema({ _id: false })
export class AlertEvents {
  /** The service stopped answering (after `failureThreshold` consecutive failures). */
  @Prop({ default: true })
  down: boolean;

  /** It came back after being down. */
  @Prop({ default: true })
  recovered: boolean;

  /** Answering, but slower than the response-time threshold. */
  @Prop({ default: true })
  slow: boolean;

  /** HTTP status differs from the expected one, or the expected text is missing. */
  @Prop({ default: true })
  unexpectedResponse: boolean;

  /** TLS certificate invalid, self-signed or for another host. */
  @Prop({ default: true })
  sslInvalid: boolean;

  /** TLS certificate expiring within `sslDaysBefore` days. */
  @Prop({ default: true })
  sslExpiring: boolean;

  /** The domain stopped resolving (DNS/registrar problem). */
  @Prop({ default: true })
  dnsFailure: boolean;

  @Prop({ default: true })
  highCpu: boolean;

  @Prop({ default: true })
  highMemory: boolean;

  /** The most common cause of a server going down silently. */
  @Prop({ default: true })
  highDisk: boolean;

  /** systemd units in failed state, or containers that exited. */
  @Prop({ default: true })
  serviceDown: boolean;

  /** Last deploy of the provider failed. */
  @Prop({ default: true })
  deployFailed: boolean;

  /** The provider reports the service suspended (unpaid, quota, manual). */
  @Prop({ default: true })
  providerSuspended: boolean;
}

export const AlertEventsSchema = SchemaFactory.createForClass(AlertEvents);

@Schema({ _id: false })
export class AlertThresholds {
  @Prop({ default: 3000 })
  responseMs: number;

  @Prop({ default: 85 })
  cpuPercent: number;

  @Prop({ default: 90 })
  memoryPercent: number;

  @Prop({ default: 85 })
  diskPercent: number;

  @Prop({ default: 14 })
  sslDaysBefore: number;

  /** Consecutive failed checks before declaring it down (avoids one-off blips). */
  @Prop({ default: 2 })
  failureThreshold: number;
}

export const AlertThresholdsSchema =
  SchemaFactory.createForClass(AlertThresholds);

@Schema({ _id: false })
export class AlertSettings {
  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: true })
  email: boolean;

  @Prop({ default: true })
  whatsapp: boolean;

  /** Extra addresses/numbers for this connection, on top of the global recipients. */
  @Prop({ type: [String], default: [] })
  extraEmails: string[];

  @Prop({ type: [String], default: [] })
  extraPhones: string[];

  /** Minutes to wait before repeating the same alert, so a long outage is not spam. */
  @Prop({ default: 60 })
  repeatAfterMinutes: number;

  @Prop({ type: AlertEventsSchema, default: () => ({}) })
  events: AlertEvents;

  @Prop({ type: AlertThresholdsSchema, default: () => ({}) })
  thresholds: AlertThresholds;
}

export const AlertSettingsSchema = SchemaFactory.createForClass(AlertSettings);

@Schema({ timestamps: true })
export class ProjectConnection {
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  project: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: ConnectionType, required: true })
  type: ConnectionType;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 5, min: 1, max: 1440 })
  intervalMinutes: number;

  // --- http -----------------------------------------------------------------
  @Prop({ trim: true })
  url?: string;

  @Prop({ default: 200 })
  expectedStatus?: number;

  /** Text that must appear in the body — catches "the site answers but is broken". */
  @Prop({ trim: true })
  expectedText?: string;

  // --- ssh ------------------------------------------------------------------
  @Prop({ trim: true })
  host?: string;

  @Prop({ default: 22 })
  port?: number;

  @Prop({ trim: true })
  username?: string;

  // --- provider (render / netlify / coolify) --------------------------------
  /** Render service id, Netlify site id or Coolify application uuid. */
  @Prop({ trim: true })
  serviceId?: string;

  /** Self-hosted Coolify instance URL. */
  @Prop({ trim: true })
  providerBaseUrl?: string;

  // --- secrets (AES-GCM, never returned by the API) -------------------------
  @Prop({ select: false })
  secretPassword?: string;

  @Prop({ select: false })
  secretPrivateKey?: string;

  @Prop({ select: false })
  secretPassphrase?: string;

  @Prop({ select: false })
  secretApiToken?: string;

  // --- alerting -------------------------------------------------------------
  @Prop({ type: AlertSettingsSchema, default: () => ({}) })
  alerts: AlertSettings;

  // --- live state -----------------------------------------------------------
  @Prop({
    type: String,
    enum: ConnectionStatus,
    default: ConnectionStatus.UNKNOWN,
  })
  status: ConnectionStatus;

  @Prop({ type: Date, default: null })
  lastCheckedAt: Date | null;

  @Prop({ type: Date, default: null })
  lastStatusChangeAt: Date | null;

  @Prop({ default: 0 })
  consecutiveFailures: number;

  @Prop({ trim: true })
  lastError?: string;

  /** Alert key -> last time it was sent, to honour `repeatAfterMinutes`. */
  @Prop({ type: Object, default: {} })
  lastAlertAt: Record<string, Date>;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const ProjectConnectionSchema =
  SchemaFactory.createForClass(ProjectConnection);
