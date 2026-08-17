import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { BackupRunStatus } from './database-connection.schema';

export type DatabaseBackupDocument = HydratedDocument<DatabaseBackup>;

/** Cómo se disparó la corrida — sirve para leer el historial de un vistazo. */
export enum BackupTrigger {
  SCHEDULED = 'scheduled',
  MANUAL = 'manual',
}

/**
 * Un `mongodump --gzip` guardado en R2. Las filas con estado `success` son las que cuentan
 * para la retención: al superar el tope de la conexión se borra la más vieja, objeto incluido.
 */
@Schema({ timestamps: true })
export class DatabaseBackup {
  /**
   * El tipo va como `MongooseSchema.Types.ObjectId` y no como `Types.ObjectId`: con el
   * segundo, `@Prop` arma el campo como `Mixed`, y un campo `Mixed` no castea. La fila se
   * guarda con el `_id` de la conexión (un ObjectId) pero el historial se pide por id de
   * texto, así que la comparación quedaba ObjectId contra string y no devolvía nada nunca.
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'DatabaseConnection',
    required: true,
    index: true,
  })
  connection: Types.ObjectId;

  /** Copiado al crear la fila: el historial se sigue leyendo si la conexión se renombra. */
  @Prop({ trim: true })
  connectionName: string;

  @Prop({ trim: true })
  database: string;

  @Prop({ type: String, enum: BackupRunStatus, required: true })
  status: BackupRunStatus;

  @Prop({ type: String, enum: BackupTrigger, default: BackupTrigger.SCHEDULED })
  trigger: BackupTrigger;

  /** Key del objeto en R2. Vacía mientras corre o si falló antes de subir. */
  @Prop({ trim: true })
  storageKey?: string;

  @Prop({ trim: true })
  filename?: string;

  @Prop({ default: 0 })
  sizeBytes: number;

  @Prop({ default: 0 })
  durationMs: number;

  @Prop({ type: Date, required: true })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  finishedAt: Date | null;

  @Prop({ trim: true })
  error?: string;

  /** Últimas líneas de la salida de `mongodump`, para diagnosticar una falla sin el servidor. */
  @Prop({ trim: true })
  log?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  triggeredBy: Types.ObjectId | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const DatabaseBackupSchema =
  SchemaFactory.createForClass(DatabaseBackup);

// El historial siempre se lee por conexión y de lo más nuevo a lo más viejo.
DatabaseBackupSchema.index({ connection: 1, startedAt: -1 });
