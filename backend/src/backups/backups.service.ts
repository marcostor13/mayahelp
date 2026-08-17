import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, mongo } from 'mongoose';
import {
  BackupRunStatus,
  DatabaseConnection,
  DatabaseConnectionDocument,
  DatabaseConnectionType,
} from './schemas/database-connection.schema';
import {
  BackupTrigger,
  DatabaseBackup,
  DatabaseBackupDocument,
} from './schemas/database-backup.schema';
import { CreateDatabaseConnectionDto } from './dto/create-database-connection.dto';
import { UpdateDatabaseConnectionDto } from './dto/update-database-connection.dto';
import { EncryptionService } from '../common/encryption/encryption.service';
import { BackupStorageService } from './backup-storage.service';
import { runMongoDump } from './mongodump.runner';
import { SshTunnel, openSshTunnel } from './ssh-tunnel';
import {
  buildTunneledUri,
  databaseFromUri,
  isLikelyMongoUri,
  redactUri,
} from './mongo-uri';
import {
  BackupFrequency,
  BackupSchedule,
  describeSchedule,
  nextRunAt,
} from './lima-schedule';

/** Los secretos son de solo escritura: entran por el DTO y nunca vuelven a salir. */
const SECRET_FIELDS = [
  'secretUri',
  'secretSshPassword',
  'secretSshPrivateKey',
  'secretSshPassphrase',
  'secretMongoPassword',
] as const;

/** DTO -> campo cifrado del documento. */
const SECRET_INPUTS: [
  keyof CreateDatabaseConnectionDto,
  (typeof SECRET_FIELDS)[number],
][] = [
  ['uri', 'secretUri'],
  ['sshPassword', 'secretSshPassword'],
  ['sshPrivateKey', 'secretSshPrivateKey'],
  ['sshPassphrase', 'secretSshPassphrase'],
  ['mongoPassword', 'secretMongoPassword'],
];

const SECRET_SELECT = SECRET_FIELDS.map((field) => `+${field}`).join(' ');

/** Cuántas corridas muestra el historial de cada conexión. */
const HISTORY_LIMIT = 20;

const TEST_CONNECTION_TIMEOUT_MS = 15_000;

/** Adónde apuntar `mongodump`, más lo que haya que cerrar después. */
interface BackupTarget {
  uri: string;
  database: string;
  close(): Promise<void>;
}

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly mongodumpBinary: string;
  /** Conexiones con un dump en curso, para que un "ejecutar ahora" no pise al cron. */
  private readonly running = new Set<string>();

  constructor(
    @InjectModel(DatabaseConnection.name)
    private readonly connectionModel: Model<DatabaseConnectionDocument>,
    @InjectModel(DatabaseBackup.name)
    private readonly backupModel: Model<DatabaseBackupDocument>,
    private readonly encryption: EncryptionService,
    private readonly storage: BackupStorageService,
    configService: ConfigService,
  ) {
    this.mongodumpBinary =
      configService.get<string>('backups.mongodumpPath') || 'mongodump';
  }

  // --- CRUD -----------------------------------------------------------------

  async create(dto: CreateDatabaseConnectionDto, createdBy: string) {
    this.assertShape(dto.type, dto, true);

    const schedule = { ...defaultSchedule(), ...(dto.schedule ?? {}) };
    const connection = await this.connectionModel.create({
      ...this.withoutSecrets(dto),
      ...this.encryptSecrets(dto),
      database: this.resolveDatabaseName(dto),
      schedule,
      nextRunAt: dto.isActive === false ? null : nextRunAt(schedule),
      createdBy,
    });
    return this.toPublic(connection);
  }

  async update(id: string, dto: UpdateDatabaseConnectionDto) {
    const connection = await this.findOneOrFail(id);
    this.assertShape(
      connection.type,
      { ...connection.toObject(), ...dto },
      false,
    );

    Object.assign(connection, this.withoutSecrets(dto));
    // String vacío = "borrá este secreto"; `undefined` = "dejalo como está".
    for (const [field, value] of Object.entries(this.encryptSecrets(dto))) {
      (connection as unknown as Record<string, unknown>)[field] = value;
    }

    if (dto.uri !== undefined || dto.database !== undefined) {
      const database = this.resolveDatabaseName({
        database: dto.database ?? connection.database,
        uri: dto.uri,
        type: connection.type,
      });
      if (database) connection.database = database;
    }

    if (dto.schedule) {
      // `toObject()` y no un spread del subdocumento: los valores de un subdocumento de
      // mongoose viven en `_doc`, así que spreadearlo devuelve internos y ninguno de los
      // campos — un cambio parcial dejaría el resto de la programación en sus defaults.
      connection.schedule = {
        ...plainSchedule(connection.schedule),
        ...dto.schedule,
      };
      connection.markModified('schedule');
    }

    // Reprogramar en cada cambio: si movieron la hora, la corrida vieja ya no vale.
    connection.nextRunAt = connection.isActive
      ? nextRunAt(connection.schedule)
      : null;

    await connection.save();
    return this.toPublic(connection);
  }

  /** Borra la conexión, su historial y los objetos que todavía viven en R2. */
  async remove(id: string): Promise<void> {
    const connection = await this.connectionModel.findById(id).exec();
    if (!connection) throw new NotFoundException('Conexión no encontrada');

    const backups = await this.backupModel
      .find({ connection: id }, 'storageKey')
      .lean()
      .exec();
    for (const backup of backups) {
      if (backup.storageKey) await this.storage.remove(backup.storageKey);
    }
    await this.backupModel.deleteMany({ connection: id }).exec();
    await this.connectionModel.findByIdAndDelete(id).exec();
  }

  /** Listado con la programación ya legible y las últimas corridas de cada conexión. */
  async findAll() {
    const connections = await this.connectionModel
      .find()
      .sort({ createdAt: 1 })
      .exec();

    return Promise.all(
      connections.map(async (connection) => ({
        ...this.toPublic(connection),
        backups: await this.history(connection._id.toString()),
      })),
    );
  }

  history(connectionId: string) {
    return this.backupModel
      .find({ connection: connectionId })
      .sort({ startedAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean()
      .exec();
  }

  /** Link firmado para bajar un dump. Solo sirve si la corrida terminó bien. */
  async downloadUrl(backupId: string): Promise<{ url: string }> {
    const backup = await this.backupModel.findById(backupId).lean().exec();
    if (!backup) throw new NotFoundException('Backup no encontrado');
    if (!backup.storageKey) {
      throw new BadRequestException(
        'Ese backup no tiene archivo: la corrida falló antes de subirlo.',
      );
    }
    return { url: await this.storage.downloadUrl(backup.storageKey) };
  }

  // --- prueba de conexión ---------------------------------------------------

  /**
   * Abre la conexión de verdad (túnel incluido) y hace un `ping`. Es lo que separa
   * "guardé mal la contraseña" de "el backup falló a las 3 de la mañana".
   */
  async testConnection(id: string) {
    const connection = await this.findOneOrFail(id, true);
    const startedAt = Date.now();
    let target: BackupTarget | null = null;

    try {
      target = await this.resolveTarget(connection);
      const client = new mongo.MongoClient(target.uri, {
        serverSelectionTimeoutMS: TEST_CONNECTION_TIMEOUT_MS,
        connectTimeoutMS: TEST_CONNECTION_TIMEOUT_MS,
      });
      try {
        await client.connect();
        await client.db(target.database).command({ ping: 1 });
        const collections = await client
          .db(target.database)
          .listCollections({}, { nameOnly: true })
          .toArray();
        return {
          ok: true as const,
          database: target.database,
          collections: collections.length,
          latencyMs: Date.now() - startedAt,
        };
      } finally {
        await client.close().catch(() => undefined);
      }
    } catch (error) {
      return {
        ok: false as const,
        database: connection.database ?? '',
        collections: 0,
        latencyMs: Date.now() - startedAt,
        // El driver incluye la URI completa al fallar la selección de servidor.
        error: failureMessage(error),
      };
    } finally {
      await target?.close();
    }
  }

  // --- backups --------------------------------------------------------------

  async runNow(id: string, userId: string) {
    const connection = await this.findOneOrFail(id, true);
    return this.runBackup(connection, BackupTrigger.MANUAL, userId);
  }

  /** Conexiones activas cuya hora ya llegó. Es lo que consume el scheduler. */
  findDueConnections(limit = 5): Promise<DatabaseConnectionDocument[]> {
    return this.connectionModel
      .find({ isActive: true, nextRunAt: { $ne: null, $lte: new Date() } })
      .sort({ nextRunAt: 1 })
      .limit(limit)
      .select(SECRET_SELECT)
      .exec();
  }

  /**
   * Vuelca la base, sube el `.archive.gz` a R2 y aplica la retención.
   *
   * El candado se toma y se suelta acá afuera, envolviendo *todo* el trabajo: si algo falla
   * antes de que exista la fila del historial —abrir esa misma fila, por ejemplo— la
   * conexión igual queda libre. Si no, un error temprano la dejaba trabada para siempre y
   * cada intento posterior moría con "ya hay un backup en curso".
   */
  async runBackup(
    connection: DatabaseConnectionDocument,
    trigger: BackupTrigger,
    userId: string | null,
  ) {
    const connectionId = connection._id.toString();
    if (this.running.has(connectionId)) {
      throw new BadRequestException(
        'Ya hay un backup en curso para esta conexión.',
      );
    }
    // `nextRunAt` recién se mueve al terminar, así que este candado es lo único que evita
    // que un "ejecutar ahora" se monte sobre el dump que el cron ya tiene en curso.
    this.running.add(connectionId);
    try {
      return await this.dumpAndRecord(connection, trigger, userId);
    } finally {
      this.running.delete(connectionId);
    }
  }

  /**
   * La corrida en sí. La fila del historial se crea antes de arrancar para que un dump que
   * se corta a la mitad —o un reinicio del contenedor— quede registrado igual, en vez de
   * desaparecer.
   */
  private async dumpAndRecord(
    connection: DatabaseConnectionDocument,
    trigger: BackupTrigger,
    userId: string | null,
  ) {
    const connectionId = connection._id.toString();
    const startedAt = new Date();
    const backup = await this.backupModel.create({
      connection: connection._id,
      connectionName: connection.name,
      database: connection.database ?? '',
      status: BackupRunStatus.RUNNING,
      trigger,
      startedAt,
      triggeredBy: userId ? new Types.ObjectId(userId) : null,
    });

    let target: BackupTarget | null = null;
    let cleanupDump: (() => Promise<void>) | null = null;

    try {
      this.storage.assertConfigured();
      target = await this.resolveTarget(connection);

      const dump = await runMongoDump({
        uri: target.uri,
        database: target.database,
        binary: this.mongodumpBinary,
      });
      cleanupDump = dump.cleanup;

      const filename = `${target.database}-${stamp(startedAt)}.archive.gz`;
      const storageKey = `backups/${connectionId}/${filename}`;
      await this.storage.upload(dump.archivePath, storageKey, dump.sizeBytes);

      backup.status = BackupRunStatus.SUCCESS;
      backup.storageKey = storageKey;
      backup.filename = filename;
      backup.database = target.database;
      backup.sizeBytes = dump.sizeBytes;
      // mongodump repite la URI en su salida; el historial es visible desde el panel.
      backup.log = redactUri(dump.log);
      backup.finishedAt = new Date();
      backup.durationMs = backup.finishedAt.getTime() - startedAt.getTime();
      await backup.save();

      await this.applyRetention(connection);
      await this.recordRun(connection, BackupRunStatus.SUCCESS);

      this.logger.log(
        `Backup de "${connection.name}" (${target.database}): ${formatBytes(dump.sizeBytes)} en ${Math.round(backup.durationMs / 1000)}s`,
      );
    } catch (error) {
      const message = failureMessage(error);
      backup.status = BackupRunStatus.FAILED;
      backup.error = message;
      backup.finishedAt = new Date();
      backup.durationMs = backup.finishedAt.getTime() - startedAt.getTime();
      await backup.save();
      await this.recordRun(connection, BackupRunStatus.FAILED, message);

      this.logger.warn(`Backup de "${connection.name}" falló: ${message}`);
    } finally {
      await cleanupDump?.().catch(() => undefined);
      await target?.close().catch(() => undefined);
    }

    return backup.toObject();
  }

  /**
   * Deja solo los últimos `retentionCount` backups buenos y borra el resto, objeto de R2
   * incluido. Las corridas fallidas no ocupan lugar en el cupo —no tienen archivo— pero se
   * podan igual para que el historial no crezca sin fin.
   */
  private async applyRetention(
    connection: DatabaseConnectionDocument,
  ): Promise<void> {
    const keep = connection.retentionCount || 3;
    const successful = await this.backupModel
      .find({ connection: connection._id, status: BackupRunStatus.SUCCESS })
      .sort({ startedAt: -1 })
      .select('storageKey')
      .exec();

    for (const old of successful.slice(keep)) {
      if (old.storageKey) await this.storage.remove(old.storageKey);
      await this.backupModel.findByIdAndDelete(old._id).exec();
    }

    // El historial de fallas se recorta al mismo tamaño que el listado.
    const failed = await this.backupModel
      .find({ connection: connection._id, status: BackupRunStatus.FAILED })
      .sort({ startedAt: -1 })
      .select('_id')
      .exec();
    const staleFailures = failed.slice(HISTORY_LIMIT).map((row) => row._id);
    if (staleFailures.length > 0) {
      await this.backupModel.deleteMany({ _id: { $in: staleFailures } }).exec();
    }
  }

  /** Cierra la corrida en la conexión y agenda la siguiente. */
  private async recordRun(
    connection: DatabaseConnectionDocument,
    status: BackupRunStatus,
    error?: string,
  ): Promise<void> {
    const now = new Date();
    await this.connectionModel
      .findByIdAndUpdate(connection._id, {
        lastRunAt: now,
        lastStatus: status,
        lastError: error ?? '',
        ...(status === BackupRunStatus.SUCCESS ? { lastSuccessAt: now } : {}),
        // Una falla no desprograma: se reintenta en la próxima ventana.
        nextRunAt: connection.isActive
          ? nextRunAt(connection.schedule, now)
          : null,
      })
      .exec();
  }

  // --- resolución de la conexión -------------------------------------------

  /**
   * Traduce una conexión guardada a la URI concreta que va a usar `mongodump`. En modo
   * `ssh` abre el túnel primero; `close()` es lo que lo cierra, y hay que llamarlo siempre.
   */
  private async resolveTarget(
    connection: DatabaseConnectionDocument,
  ): Promise<BackupTarget> {
    if (connection.type === DatabaseConnectionType.ATLAS) {
      const uri = this.secret(connection, 'secretUri');
      if (!uri) {
        throw new BadRequestException(
          'La conexión no tiene una URI guardada (o no se pudo descifrar: revisá ENCRYPTION_KEY).',
        );
      }
      const database = connection.database || databaseFromUri(uri);
      if (!database) {
        throw new BadRequestException(
          'No se sabe qué base respaldar: indicá el nombre o incluilo en la URI.',
        );
      }
      return { uri, database, close: () => Promise.resolve() };
    }

    const database = connection.database;
    if (!database) {
      throw new BadRequestException('La conexión no tiene base configurada.');
    }

    let tunnel: SshTunnel;
    try {
      tunnel = await openSshTunnel({
        host: connection.sshHost!,
        port: connection.sshPort ?? 22,
        username: connection.sshUsername!,
        password: this.secret(connection, 'secretSshPassword'),
        privateKey: this.secret(connection, 'secretSshPrivateKey'),
        passphrase: this.secret(connection, 'secretSshPassphrase'),
        remoteHost: connection.mongoHost || '127.0.0.1',
        remotePort: connection.mongoPort ?? 27017,
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    return {
      uri: buildTunneledUri({
        localPort: tunnel.localPort,
        database,
        username: connection.mongoUsername,
        password: this.secret(connection, 'secretMongoPassword'),
        authDatabase: connection.authDatabase,
      }),
      database,
      close: () => tunnel.close(),
    };
  }

  private secret(
    connection: DatabaseConnectionDocument,
    field: (typeof SECRET_FIELDS)[number],
  ): string | undefined {
    const value = connection.get(field);
    return value ? (this.encryption.decrypt(value) ?? undefined) : undefined;
  }

  // --- helpers --------------------------------------------------------------

  private async findOneOrFail(
    id: string,
    withSecrets = false,
  ): Promise<DatabaseConnectionDocument> {
    const query = this.connectionModel.findById(id);
    if (withSecrets) query.select(SECRET_SELECT);
    const connection = await query.exec();
    if (!connection) throw new NotFoundException('Conexión no encontrada');
    return connection;
  }

  /**
   * Valida que estén los campos que el tipo elegido necesita. En un alta hay que exigir la
   * credencial; en una edición no, porque el secreto ya guardado no vuelve en el formulario.
   */
  private assertShape(
    type: DatabaseConnectionType,
    dto: Partial<CreateDatabaseConnectionDto>,
    isCreate: boolean,
  ): void {
    if (type === DatabaseConnectionType.ATLAS) {
      if (isCreate && !dto.uri) {
        throw new BadRequestException(
          'Una conexión de MongoDB Atlas necesita la URI de conexión.',
        );
      }
      if (dto.uri && !isLikelyMongoUri(dto.uri)) {
        throw new BadRequestException(
          'La URI debe empezar con mongodb:// o mongodb+srv://',
        );
      }
      if (isCreate && !dto.database && !databaseFromUri(dto.uri ?? '')) {
        throw new BadRequestException(
          'Indicá qué base respaldar, o incluila en la URI (…mongodb.net/mi-base).',
        );
      }
      return;
    }

    const missing = (['sshHost', 'sshUsername', 'database'] as const).filter(
      (field) => !dto[field],
    );
    if (missing.length > 0) {
      const labels: Record<string, string> = {
        sshHost: 'host del servidor',
        sshUsername: 'usuario SSH',
        database: 'base de datos',
      };
      throw new BadRequestException(
        `Faltan datos de la conexión SSH: ${missing.map((field) => labels[field]).join(', ')}.`,
      );
    }
    if (isCreate && !dto.sshPassword && !dto.sshPrivateKey) {
      throw new BadRequestException(
        'Una conexión por SSH necesita una contraseña o una clave privada.',
      );
    }
  }

  /** Con Atlas el nombre puede venir del formulario o de la propia URI. */
  private resolveDatabaseName(dto: {
    database?: string;
    uri?: string;
    type: DatabaseConnectionType;
  }): string | undefined {
    if (dto.database) return dto.database;
    if (dto.type === DatabaseConnectionType.ATLAS && dto.uri) {
      return databaseFromUri(dto.uri) ?? undefined;
    }
    return undefined;
  }

  /** Lo que la API sí puede devolver: los secretos se reducen a "¿está cargado?". */
  private toPublic(connection: DatabaseConnectionDocument) {
    const plain = connection.toObject();
    for (const field of SECRET_FIELDS) delete plain[field];
    return {
      ...plain,
      hasUri: Boolean(connection.get('secretUri')),
      hasSshPassword: Boolean(connection.get('secretSshPassword')),
      hasSshPrivateKey: Boolean(connection.get('secretSshPrivateKey')),
      hasMongoPassword: Boolean(connection.get('secretMongoPassword')),
      scheduleLabel: describeSchedule(connection.schedule),
    };
  }

  private withoutSecrets(
    dto: CreateDatabaseConnectionDto | UpdateDatabaseConnectionDto,
  ) {
    const copy: Record<string, unknown> = { ...dto };
    for (const [input] of SECRET_INPUTS) delete copy[input];
    delete copy.schedule;
    return copy;
  }

  private encryptSecrets(
    dto: CreateDatabaseConnectionDto | UpdateDatabaseConnectionDto,
  ): Record<string, string | undefined> {
    const encrypted: Record<string, string | undefined> = {};
    for (const [input, field] of SECRET_INPUTS) {
      const value = dto[input] as string | undefined;
      if (value === undefined) continue;
      encrypted[field] = value ? this.encryption.encrypt(value.trim()) : '';
    }
    return encrypted;
  }
}

/**
 * Mensaje presentable de lo que sea que haya fallado. No todo lo que se lanza es un
 * `Error`: si viene un string —o un objeto sin `message`— el viejo `(error as Error).message`
 * quedaba `undefined` y `redactUri` reventaba dentro del propio `catch`, dejando la corrida
 * clavada en "en curso" y sin explicación.
 */
function failureMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return redactUri(raw) || 'Error desconocido';
}

/**
 * Los valores de un subdocumento de mongoose viven en `_doc`: sin `toObject()` un spread
 * devuelve internos y ninguno de los campos. El tipo no lo declara, de ahí el cast.
 */
function plainSchedule(schedule: BackupSchedule): BackupSchedule {
  const document = schedule as BackupSchedule & {
    toObject?: () => BackupSchedule;
  };
  return document.toObject ? document.toObject() : { ...schedule };
}

function defaultSchedule(): BackupSchedule {
  return {
    frequency: BackupFrequency.DAILY,
    hour: 3,
    minute: 0,
    dayOfWeek: 1,
    dayOfMonth: 1,
  };
}

/** `2026-08-15T0300` — ordena alfabéticamente igual que cronológicamente. */
function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/-\d{3}Z$/, 'Z');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
