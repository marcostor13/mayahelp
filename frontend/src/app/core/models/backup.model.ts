/** MongoDB Atlas (URI directa) o MongoDB detrás de un servidor, alcanzable por SSH. */
export type DatabaseConnectionType = 'atlas' | 'ssh';

export type BackupFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

export type BackupRunStatus = 'running' | 'success' | 'failed';

export type BackupTrigger = 'scheduled' | 'manual';

/** La hora es siempre hora de Lima; el backend la traduce a UTC al guardar. */
export interface BackupSchedule {
  frequency: BackupFrequency;
  hour: number;
  minute: number;
  /** 0 = domingo. Solo aplica a la frecuencia semanal. */
  dayOfWeek: number;
  /** 1-28. Solo aplica a la frecuencia mensual. */
  dayOfMonth: number;
}

export interface DatabaseBackup {
  _id: string;
  connection: string;
  connectionName: string;
  database: string;
  status: BackupRunStatus;
  trigger: BackupTrigger;
  storageKey?: string;
  filename?: string;
  sizeBytes: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string | null;
  error?: string;
  log?: string;
}

export interface DatabaseConnection {
  _id: string;
  name: string;
  type: DatabaseConnectionType;
  database?: string;
  isActive: boolean;

  sshHost?: string;
  sshPort?: number;
  sshUsername?: string;
  mongoHost?: string;
  mongoPort?: number;
  mongoUsername?: string;
  authDatabase?: string;

  /** Los secretos nunca vuelven de la API; solo si están cargados. */
  hasUri: boolean;
  hasSshPassword: boolean;
  hasSshPrivateKey: boolean;
  hasMongoPassword: boolean;

  retentionCount: number;
  schedule: BackupSchedule;
  /** Texto ya armado por el backend: "Todos los días a las 03:00 (Lima)". */
  scheduleLabel: string;

  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: BackupRunStatus | null;
  lastError?: string;
  lastSuccessAt: string | null;
  createdAt: string;

  /** Historial reciente, incluido en el listado para no pedirlo por separado. */
  backups: DatabaseBackup[];
}

export interface CreateDatabaseConnectionPayload {
  name: string;
  type: DatabaseConnectionType;
  database?: string;
  isActive?: boolean;

  sshHost?: string;
  sshPort?: number;
  sshUsername?: string;
  mongoHost?: string;
  mongoPort?: number;
  mongoUsername?: string;
  authDatabase?: string;

  // Secretos: se mandan solo cuando el usuario los escribe.
  uri?: string;
  sshPassword?: string;
  sshPrivateKey?: string;
  sshPassphrase?: string;
  mongoPassword?: string;

  retentionCount?: number;
  schedule?: Partial<BackupSchedule>;
}

export interface TestConnectionResult {
  ok: boolean;
  database: string;
  collections: number;
  latencyMs: number;
  error?: string;
}
