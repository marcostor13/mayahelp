import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BackupFrequency } from '../lima-schedule';

export type DatabaseConnectionDocument = HydratedDocument<DatabaseConnection>;

/** Cómo se llega a la base: directo por URI, o abriendo antes un túnel SSH. */
export enum DatabaseConnectionType {
  /** MongoDB Atlas (o cualquier `mongodb://`/`mongodb+srv://` accesible desde el backend). */
  ATLAS = 'atlas',
  /** MongoDB en un servidor propio, alcanzable solo a través de SSH. */
  SSH = 'ssh',
}

export enum BackupRunStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
}

/** Cuándo corre el backup. La hora es siempre hora de Lima (ver `lima-schedule.ts`). */
@Schema({ _id: false })
export class BackupSchedule {
  @Prop({
    type: String,
    enum: BackupFrequency,
    default: BackupFrequency.DAILY,
  })
  frequency: BackupFrequency;

  @Prop({ default: 3, min: 0, max: 23 })
  hour: number;

  @Prop({ default: 0, min: 0, max: 59 })
  minute: number;

  /** 0 = domingo. Solo se usa con frecuencia semanal. */
  @Prop({ default: 1, min: 0, max: 6 })
  dayOfWeek: number;

  /** Tope 28 para que exista en febrero. Solo se usa con frecuencia mensual. */
  @Prop({ default: 1, min: 1, max: 28 })
  dayOfMonth: number;
}

export const BackupScheduleSchema =
  SchemaFactory.createForClass(BackupSchedule);

@Schema({ timestamps: true })
export class DatabaseConnection {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: DatabaseConnectionType, required: true })
  type: DatabaseConnectionType;

  /** Base a respaldar. Con `atlas` puede salir de la URI; con `ssh` es obligatoria. */
  @Prop({ trim: true })
  database?: string;

  /** Programación apagada: la conexión queda registrada pero el cron la saltea. */
  @Prop({ default: true })
  isActive: boolean;

  // --- ssh ------------------------------------------------------------------
  @Prop({ trim: true })
  sshHost?: string;

  @Prop({ default: 22 })
  sshPort?: number;

  @Prop({ trim: true })
  sshUsername?: string;

  /** Host de mongo visto *desde* el servidor SSH; casi siempre el propio localhost. */
  @Prop({ trim: true, default: '127.0.0.1' })
  mongoHost?: string;

  @Prop({ default: 27017 })
  mongoPort?: number;

  @Prop({ trim: true })
  mongoUsername?: string;

  /** Base contra la que autenticar (`authSource`); por defecto `admin`. */
  @Prop({ trim: true })
  authDatabase?: string;

  // --- secretos (AES-GCM, nunca los devuelve la API) ------------------------
  /** URI completa de conexión, con usuario y contraseña adentro. Tipo `atlas`. */
  @Prop({ select: false })
  secretUri?: string;

  @Prop({ select: false })
  secretSshPassword?: string;

  @Prop({ select: false })
  secretSshPrivateKey?: string;

  @Prop({ select: false })
  secretSshPassphrase?: string;

  @Prop({ select: false })
  secretMongoPassword?: string;

  // --- retención ------------------------------------------------------------
  /** Cuántos backups se conservan por base; al crear el que sobra, se borra el más viejo. */
  @Prop({ default: 3, min: 1, max: 30 })
  retentionCount: number;

  @Prop({ type: BackupScheduleSchema, default: () => ({}) })
  schedule: BackupSchedule;

  // --- estado ---------------------------------------------------------------
  /** Instante UTC de la próxima corrida; es lo que mira el scheduler. */
  @Prop({ type: Date, default: null, index: true })
  nextRunAt: Date | null;

  @Prop({ type: Date, default: null })
  lastRunAt: Date | null;

  @Prop({ type: String, enum: BackupRunStatus, default: null })
  lastStatus: BackupRunStatus | null;

  @Prop({ trim: true })
  lastError?: string;

  @Prop({ type: Date, default: null })
  lastSuccessAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const DatabaseConnectionSchema =
  SchemaFactory.createForClass(DatabaseConnection);
