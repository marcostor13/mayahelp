import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConnectionStatus,
  ConnectionType,
  ProjectConnection,
  ProjectConnectionDocument,
} from './schemas/project-connection.schema';
import {
  MonitorCheck,
  MonitorCheckDocument,
} from './schemas/monitor-check.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { EncryptionService } from './encryption.service';
import { MonitoringAlertsService } from './monitoring-alerts.service';
import { CheckResult, checkHttp } from './checkers/http-checker';
import { checkSsh } from './checkers/ssh-checker';
import {
  checkCoolify,
  checkNetlify,
  checkRender,
} from './checkers/provider-checker';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';

/** One connection's slice of the project dashboard. */
export interface ProjectDashboardItem {
  connection: Record<string, unknown>;
  uptimePercent: number | null;
  checksCount: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
  lastMetrics: Record<string, unknown>;
  history: {
    checkedAt: Date;
    status: ConnectionStatus;
    latencyMs: number | null;
  }[];
}

/** Secrets are write-only from the API's point of view. */
const SECRET_FIELDS = [
  'secretPassword',
  'secretPrivateKey',
  'secretPassphrase',
  'secretApiToken',
] as const;

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    @InjectModel(ProjectConnection.name)
    private readonly connectionModel: Model<ProjectConnectionDocument>,
    @InjectModel(MonitorCheck.name)
    private readonly checkModel: Model<MonitorCheckDocument>,
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    private readonly encryption: EncryptionService,
    private readonly alerts: MonitoringAlertsService,
  ) {}

  // --- CRUD -----------------------------------------------------------------

  async create(dto: CreateConnectionDto, createdBy: string) {
    this.assertShape(dto.type, dto);
    const connection = await this.connectionModel.create({
      ...this.withoutSecrets(dto),
      ...this.encryptSecrets(dto),
      project: dto.project,
      createdBy,
    });
    return this.toPublic(connection);
  }

  async update(id: string, dto: UpdateConnectionDto) {
    const connection = await this.connectionModel.findById(id).exec();
    if (!connection) throw new NotFoundException('Conexión no encontrada');

    Object.assign(connection, this.withoutSecrets(dto));
    // An empty string means "clear this secret"; undefined means "leave it as it is".
    for (const [field, value] of Object.entries(this.encryptSecrets(dto))) {
      (connection as unknown as Record<string, unknown>)[field] = value;
    }
    if (dto.alerts) {
      connection.alerts = {
        ...connection.alerts,
        ...dto.alerts,
      } as typeof connection.alerts;
      if (dto.alerts.events) {
        connection.alerts.events = {
          ...connection.alerts.events,
          ...dto.alerts.events,
        };
      }
      if (dto.alerts.thresholds) {
        connection.alerts.thresholds = {
          ...connection.alerts.thresholds,
          ...dto.alerts.thresholds,
        };
      }
      connection.markModified('alerts');
    }
    await connection.save();
    return this.toPublic(connection);
  }

  async remove(id: string): Promise<void> {
    const result = await this.connectionModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException('Conexión no encontrada');
    await this.checkModel.deleteMany({ connection: id }).exec();
  }

  async findByProject(projectId: string) {
    const connections = await this.connectionModel
      .find({ project: projectId })
      .sort({ createdAt: 1 })
      .exec();
    return connections.map((connection) => this.toPublic(connection));
  }

  // --- dashboard ------------------------------------------------------------

  /** One row per project with its aggregated health, for the monitoring index. */
  async overview() {
    const connections = await this.connectionModel
      .find({}, 'project name type status lastCheckedAt isActive')
      .populate<{ project?: { _id: Types.ObjectId; name?: string } }>(
        'project',
        'name',
      )
      .lean()
      .exec();

    const byProject = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        total: number;
        up: number;
        degraded: number;
        down: number;
        unknown: number;
        lastCheckedAt: Date | null;
      }
    >();

    for (const connection of connections) {
      const project = connection.project;
      if (!project?._id) continue;
      const id = project._id.toString();
      const entry = byProject.get(id) ?? {
        projectId: id,
        projectName: project.name ?? 'Proyecto',
        total: 0,
        up: 0,
        degraded: 0,
        down: 0,
        unknown: 0,
        lastCheckedAt: null,
      };
      entry.total += 1;
      entry[connection.status] += 1;
      if (
        connection.lastCheckedAt &&
        (!entry.lastCheckedAt || connection.lastCheckedAt > entry.lastCheckedAt)
      ) {
        entry.lastCheckedAt = connection.lastCheckedAt;
      }
      byProject.set(id, entry);
    }

    return [...byProject.values()].sort((a, b) =>
      a.projectName.localeCompare(b.projectName),
    );
  }

  /** Full dashboard of one project: current state, uptime, latency and history. */
  async projectDashboard(projectId: string, hours = 24) {
    const project = await this.projectModel.findById(projectId).lean().exec();
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const connections = await this.connectionModel
      .find({ project: projectId })
      .sort({ createdAt: 1 })
      .exec();

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const items: ProjectDashboardItem[] = [];

    for (const connection of connections) {
      const checks = await this.checkModel
        .find({ connection: connection._id, checkedAt: { $gte: since } })
        .sort({ checkedAt: -1 })
        .limit(200)
        .lean()
        .exec();

      const total = checks.length;
      const up = checks.filter(
        (check) => check.status === ConnectionStatus.UP,
      ).length;
      const latencies = checks
        .map((check) => check.latencyMs)
        .filter((value): value is number => typeof value === 'number');

      items.push({
        connection: this.toPublic(connection),
        uptimePercent: total > 0 ? Math.round((up / total) * 1000) / 10 : null,
        checksCount: total,
        avgLatencyMs:
          latencies.length > 0
            ? Math.round(
                latencies.reduce((a, b) => a + b, 0) / latencies.length,
              )
            : null,
        maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : null,
        lastMetrics: checks[0]?.metrics ?? {},
        history: checks
          .slice(0, 60)
          .reverse()
          .map((check) => ({
            checkedAt: check.checkedAt,
            status: check.status,
            latencyMs: check.latencyMs,
          })),
      });
    }

    return {
      project: { _id: project._id, name: project.name, status: project.status },
      windowHours: hours,
      connections: items,
    };
  }

  // --- checking -------------------------------------------------------------

  /** Connections whose interval elapsed; the scheduler feeds these to `runCheck`. */
  async findDueConnections(limit = 25): Promise<ProjectConnectionDocument[]> {
    const now = Date.now();
    const candidates = await this.connectionModel
      .find({ isActive: true })
      .sort({ lastCheckedAt: 1 })
      .limit(limit * 4)
      .select(
        '+secretPassword +secretPrivateKey +secretPassphrase +secretApiToken',
      )
      .exec();

    return candidates
      .filter((connection) => {
        if (!connection.lastCheckedAt) return true;
        const elapsed = now - connection.lastCheckedAt.getTime();
        return elapsed >= connection.intervalMinutes * 60_000;
      })
      .slice(0, limit);
  }

  async runCheckById(id: string) {
    const connection = await this.connectionModel
      .findById(id)
      .select(
        '+secretPassword +secretPrivateKey +secretPassphrase +secretApiToken',
      )
      .exec();
    if (!connection) throw new NotFoundException('Conexión no encontrada');
    return this.runCheck(connection);
  }

  /** Probes one connection, stores the sample, updates state and fires alerts. */
  async runCheck(connection: ProjectConnectionDocument) {
    const result = await this.probe(connection);
    const previousStatus = connection.status;

    const failed = result.status !== ConnectionStatus.UP;
    const consecutiveFailures = failed ? connection.consecutiveFailures + 1 : 0;

    await this.checkModel.create({
      connection: connection._id,
      project: connection.project,
      status: result.status,
      latencyMs: result.latencyMs,
      metrics: result.metrics,
      error: result.error,
    });

    const alerts = this.alerts.buildAlerts(
      connection,
      result,
      previousStatus,
      consecutiveFailures,
    );
    const projectName = await this.projectName(connection.project);
    const sentKeys = await this.alerts.dispatch(
      connection,
      projectName,
      alerts,
    );

    connection.status = result.status;
    connection.lastCheckedAt = new Date();
    connection.consecutiveFailures = consecutiveFailures;
    connection.lastError = result.error;
    if (previousStatus !== result.status) {
      connection.lastStatusChangeAt = new Date();
    }
    if (sentKeys.length > 0) {
      const stamps = { ...(connection.lastAlertAt ?? {}) };
      for (const key of sentKeys) stamps[key] = new Date();
      connection.lastAlertAt = stamps;
      connection.markModified('lastAlertAt');
    }
    await connection.save();

    return {
      connection: this.toPublic(connection),
      result,
      alerts: alerts.map((alert) => alert.key),
    };
  }

  private async probe(
    connection: ProjectConnectionDocument,
  ): Promise<CheckResult> {
    const secret = (
      field: (typeof SECRET_FIELDS)[number],
    ): string | undefined => {
      const value = connection.get(field);
      return value ? (this.encryption.decrypt(value) ?? undefined) : undefined;
    };

    switch (connection.type) {
      case ConnectionType.HTTP:
        return checkHttp({
          url: connection.url!,
          expectedStatus: connection.expectedStatus,
          expectedText: connection.expectedText,
        });
      case ConnectionType.SSH:
        return checkSsh({
          host: connection.host!,
          port: connection.port ?? 22,
          username: connection.username!,
          password: secret('secretPassword'),
          privateKey: secret('secretPrivateKey'),
          passphrase: secret('secretPassphrase'),
        });
      case ConnectionType.RENDER:
        return checkRender({
          token: secret('secretApiToken') ?? '',
          serviceId: connection.serviceId!,
        });
      case ConnectionType.NETLIFY:
        return checkNetlify({
          token: secret('secretApiToken') ?? '',
          serviceId: connection.serviceId!,
        });
      case ConnectionType.COOLIFY:
        return checkCoolify({
          token: secret('secretApiToken') ?? '',
          serviceId: connection.serviceId!,
          baseUrl: connection.providerBaseUrl,
        });
      default:
        return {
          status: ConnectionStatus.UNKNOWN,
          latencyMs: null,
          metrics: {},
          error: 'Tipo de conexión no soportado',
        };
    }
  }

  private async projectName(projectId: Types.ObjectId): Promise<string> {
    const project = await this.projectModel
      .findById(projectId, 'name')
      .lean()
      .exec();
    return project?.name ?? 'Proyecto';
  }

  // --- helpers --------------------------------------------------------------

  /** Every field the API may return: secrets are replaced by a "is it set?" flag. */
  private toPublic(connection: ProjectConnectionDocument) {
    const plain = connection.toObject();
    for (const field of SECRET_FIELDS) delete plain[field];
    return {
      ...plain,
      hasPassword: Boolean(connection.get('secretPassword')),
      hasPrivateKey: Boolean(connection.get('secretPrivateKey')),
      hasApiToken: Boolean(connection.get('secretApiToken')),
    };
  }

  private withoutSecrets(dto: CreateConnectionDto | UpdateConnectionDto) {
    const copy: Record<string, unknown> = { ...dto };
    for (const field of SECRET_FIELDS) delete copy[field];
    delete copy.password;
    delete copy.privateKey;
    delete copy.passphrase;
    delete copy.apiToken;
    delete copy.alerts;
    delete copy.project;
    return copy;
  }

  private encryptSecrets(dto: CreateConnectionDto | UpdateConnectionDto) {
    const mapping: [
      keyof (CreateConnectionDto & UpdateConnectionDto),
      string,
    ][] = [
      ['password', 'secretPassword'],
      ['privateKey', 'secretPrivateKey'],
      ['passphrase', 'secretPassphrase'],
      ['apiToken', 'secretApiToken'],
    ];
    const encrypted: Record<string, string | undefined> = {};
    for (const [input, field] of mapping) {
      const value = dto[input] as string | undefined;
      if (value === undefined) continue;
      encrypted[field] =
        value === '' ? undefined : this.encryption.encrypt(value);
    }
    return encrypted;
  }

  /** Fails early with a clear message instead of storing a connection that cannot run. */
  private assertShape(type: ConnectionType, dto: CreateConnectionDto): void {
    const missing: string[] = [];
    if (type === ConnectionType.HTTP && !dto.url) missing.push('url');
    if (type === ConnectionType.SSH) {
      if (!dto.host) missing.push('host');
      if (!dto.username) missing.push('username');
      if (!dto.password && !dto.privateKey) {
        missing.push('password o privateKey');
      }
    }
    if (
      [
        ConnectionType.RENDER,
        ConnectionType.NETLIFY,
        ConnectionType.COOLIFY,
      ].includes(type)
    ) {
      if (!dto.serviceId) missing.push('serviceId');
      if (!dto.apiToken) missing.push('apiToken');
      if (type === ConnectionType.COOLIFY && !dto.providerBaseUrl) {
        missing.push('providerBaseUrl');
      }
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan datos para una conexión de tipo ${type}: ${missing.join(', ')}`,
      );
    }
  }
}
