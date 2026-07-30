import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MonitoringService } from '../../core/services/monitoring.service';
import {
  AlertEvents,
  AlertThresholds,
  CheckMetrics,
  ConnectionDashboard,
  ConnectionStatus,
  ConnectionType,
  CreateConnectionPayload,
  ProjectConnection,
  ProjectMonitoringDashboard,
} from '../../core/models/monitoring.model';

interface MetricRow {
  key: string;
  label: string;
  icon: string;
  value: string;
  tone: 'normal' | 'warn' | 'bad' | 'good';
}

interface EventOption {
  key: keyof AlertEvents;
  label: string;
  hint: string;
  types: ConnectionType[];
}

interface ThresholdOption {
  key: keyof AlertThresholds;
  label: string;
  suffix: string;
  types: ConnectionType[];
}

const TYPE_LABELS: Record<ConnectionType, string> = {
  http: 'Sitio web',
  ssh: 'Servidor (SSH)',
  render: 'Render',
  netlify: 'Netlify',
  coolify: 'Coolify',
};

const TYPE_ICONS: Record<ConnectionType, string> = {
  http: 'language',
  ssh: 'dns',
  render: 'cloud',
  netlify: 'rocket_launch',
  coolify: 'deployed_code',
};

const TYPE_HINTS: Record<ConnectionType, string> = {
  http: 'Solo la URL pública. Revisa DNS, certificado TLS, código HTTP, latencia y contenido.',
  ssh: 'Conexión de solo lectura a un EC2 o VPS. Lee CPU, memoria, disco, servicios y contenedores.',
  render: 'Token de la API de Render (Account Settings → API Keys) y el ID del servicio (srv-...).',
  netlify: 'Personal access token de Netlify y el ID o nombre del sitio.',
  coolify: 'URL de tu instancia de Coolify, un token de la API y el UUID de la aplicación.',
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  up: 'En línea',
  degraded: 'Con problemas',
  down: 'Caído',
  unknown: 'Sin datos',
};

const STATUS_CLASSES: Record<ConnectionStatus, string> = {
  up: 'bg-emerald-100 text-emerald-800',
  degraded: 'bg-amber-100 text-amber-800',
  down: 'bg-error-container text-on-error-container',
  unknown: 'bg-surface-container-high text-on-surface-variant',
};

const STATUS_ICONS: Record<ConnectionStatus, string> = {
  up: 'check_circle',
  degraded: 'warning',
  down: 'error',
  unknown: 'help',
};

type MetricFormat =
  'ms' | 'percent' | 'bool' | 'text' | 'date' | 'bytes' | 'mb' | 'gb' | 'days' | 'number';

interface MetricDef {
  label: string;
  icon: string;
  format: MetricFormat;
  /** true when a "true" value is the bad news (suspended, redirected...). */
  invert?: boolean;
}

/**
 * Display order and wording of every metric the checkers can produce.
 * Unknown keys still render (raw) so a new metric is never silently dropped.
 */
const METRIC_DEFS: Record<string, MetricDef> = {
  // HTTP
  statusCode: { label: 'Código HTTP', icon: 'http', format: 'number' },
  responseTimeMs: { label: 'Tiempo de respuesta', icon: 'timer', format: 'ms' },
  statusOk: { label: 'Código esperado', icon: 'check_circle', format: 'bool' },
  contentOk: { label: 'Contenido esperado', icon: 'find_in_page', format: 'bool' },
  contentLength: { label: 'Tamaño de la respuesta', icon: 'description', format: 'bytes' },
  server: { label: 'Servidor', icon: 'dns', format: 'text' },
  redirected: { label: 'Redirigido', icon: 'alt_route', format: 'bool', invert: true },
  finalUrl: { label: 'URL final', icon: 'link', format: 'text' },
  dnsResolved: { label: 'El dominio resuelve', icon: 'travel_explore', format: 'bool' },
  dnsAddresses: { label: 'IPs del dominio', icon: 'lan', format: 'text' },
  sslValid: { label: 'Certificado válido', icon: 'lock', format: 'bool' },
  sslDaysToExpiry: { label: 'Certificado vence en', icon: 'event', format: 'days' },
  sslValidTo: { label: 'Certificado válido hasta', icon: 'schedule', format: 'date' },
  sslIssuer: { label: 'Emisor del certificado', icon: 'verified_user', format: 'text' },
  sslError: { label: 'Error de certificado', icon: 'gpp_bad', format: 'text' },

  // SSH
  connectTimeMs: { label: 'Tiempo de conexión', icon: 'timer', format: 'ms' },
  uptimeDays: { label: 'Encendido hace', icon: 'schedule', format: 'days' },
  cpuPercent: { label: 'CPU', icon: 'memory', format: 'percent' },
  cpuCores: { label: 'Núcleos', icon: 'developer_board', format: 'number' },
  load1: { label: 'Carga 1 min', icon: 'speed', format: 'number' },
  load5: { label: 'Carga 5 min', icon: 'speed', format: 'number' },
  load15: { label: 'Carga 15 min', icon: 'speed', format: 'number' },
  memoryPercent: { label: 'Memoria', icon: 'memory_alt', format: 'percent' },
  memoryUsedMb: { label: 'Memoria usada', icon: 'sd_card', format: 'mb' },
  memoryTotalMb: { label: 'Memoria total', icon: 'sd_card', format: 'mb' },
  diskPercent: { label: 'Disco', icon: 'hard_drive', format: 'percent' },
  diskUsedGb: { label: 'Disco usado', icon: 'hard_drive', format: 'gb' },
  diskTotalGb: { label: 'Disco total', icon: 'hard_drive', format: 'gb' },
  processes: { label: 'Procesos', icon: 'list_alt', format: 'number' },
  failedServices: { label: 'Servicios fallidos', icon: 'error', format: 'number', invert: true },
  containersRunning: { label: 'Contenedores activos', icon: 'deployed_code', format: 'number' },
  containersStopped: {
    label: 'Contenedores detenidos',
    icon: 'deployed_code_alert',
    format: 'number',
    invert: true,
  },

  // Proveedores
  provider: { label: 'Proveedor', icon: 'cloud', format: 'text' },
  serviceName: { label: 'Servicio', icon: 'label', format: 'text' },
  serviceType: { label: 'Tipo de servicio', icon: 'category', format: 'text' },
  serviceUrl: { label: 'URL del servicio', icon: 'link', format: 'text' },
  siteName: { label: 'Sitio', icon: 'label', format: 'text' },
  siteUrl: { label: 'URL del sitio', icon: 'link', format: 'text' },
  siteState: { label: 'Estado del sitio', icon: 'toggle_on', format: 'text' },
  applicationName: { label: 'Aplicación', icon: 'label', format: 'text' },
  applicationStatus: { label: 'Estado de la aplicación', icon: 'toggle_on', format: 'text' },
  fqdn: { label: 'Dominio', icon: 'link', format: 'text' },
  branch: { label: 'Rama', icon: 'account_tree', format: 'text' },
  deployBranch: { label: 'Rama', icon: 'account_tree', format: 'text' },
  suspended: { label: 'Suspendido', icon: 'block', format: 'bool', invert: true },
  deployStatus: { label: 'Último deploy', icon: 'rocket_launch', format: 'text' },
  deployCommit: { label: 'Commit', icon: 'commit', format: 'text' },
  deployFinishedAt: { label: 'Deploy terminado', icon: 'schedule', format: 'date' },
  deployPublishedAt: { label: 'Deploy publicado', icon: 'schedule', format: 'date' },
  lastOnlineAt: { label: 'Última vez en línea', icon: 'schedule', format: 'date' },
  providerStatus: { label: 'Respuesta del proveedor', icon: 'sync_problem', format: 'number' },
  latencyMs: { label: 'Latencia de la API', icon: 'timer', format: 'ms' },
};

const METRIC_ORDER = Object.keys(METRIC_DEFS);

const EVENT_OPTIONS: EventOption[] = [
  {
    key: 'down',
    label: 'Caída',
    hint: 'El servicio dejó de responder',
    types: ['http', 'ssh', 'render', 'netlify', 'coolify'],
  },
  {
    key: 'recovered',
    label: 'Recuperación',
    hint: 'Volvió a estar en línea',
    types: ['http', 'ssh', 'render', 'netlify', 'coolify'],
  },
  {
    key: 'slow',
    label: 'Respuesta lenta',
    hint: 'Supera el umbral de latencia',
    types: ['http', 'ssh'],
  },
  {
    key: 'unexpectedResponse',
    label: 'Respuesta inesperada',
    hint: 'Otro código HTTP o falta el texto esperado',
    types: ['http'],
  },
  {
    key: 'sslInvalid',
    label: 'Certificado inválido',
    hint: 'TLS vencido o no confiable',
    types: ['http'],
  },
  {
    key: 'sslExpiring',
    label: 'Certificado por vencer',
    hint: 'Avisa antes del vencimiento',
    types: ['http'],
  },
  {
    key: 'dnsFailure',
    label: 'Problema de dominio',
    hint: 'El DNS dejó de resolver',
    types: ['http'],
  },
  { key: 'highCpu', label: 'CPU alta', hint: 'Carga sostenida sobre el umbral', types: ['ssh'] },
  { key: 'highMemory', label: 'Memoria alta', hint: 'Uso de RAM sobre el umbral', types: ['ssh'] },
  { key: 'highDisk', label: 'Disco lleno', hint: 'Uso de disco sobre el umbral', types: ['ssh'] },
  {
    key: 'serviceDown',
    label: 'Servicios caídos',
    hint: 'Unidades de systemd o contenedores detenidos',
    types: ['ssh'],
  },
  {
    key: 'deployFailed',
    label: 'Deploy fallido',
    hint: 'El último despliegue terminó con error',
    types: ['render', 'netlify', 'coolify'],
  },
  {
    key: 'providerSuspended',
    label: 'Servicio suspendido',
    hint: 'El proveedor suspendió el servicio',
    types: ['render', 'netlify', 'coolify'],
  },
];

const THRESHOLD_OPTIONS: ThresholdOption[] = [
  { key: 'responseMs', label: 'Latencia máxima', suffix: 'ms', types: ['http', 'ssh'] },
  { key: 'cpuPercent', label: 'CPU máxima', suffix: '%', types: ['ssh'] },
  { key: 'memoryPercent', label: 'Memoria máxima', suffix: '%', types: ['ssh'] },
  { key: 'diskPercent', label: 'Disco máximo', suffix: '%', types: ['ssh'] },
  { key: 'sslDaysBefore', label: 'Avisar certificado', suffix: 'días antes', types: ['http'] },
  {
    key: 'failureThreshold',
    label: 'Fallos seguidos para avisar',
    suffix: 'chequeos',
    types: ['http', 'ssh', 'render', 'netlify', 'coolify'],
  },
];

const DEFAULT_EVENTS: AlertEvents = {
  down: true,
  recovered: true,
  slow: true,
  unexpectedResponse: true,
  sslInvalid: true,
  sslExpiring: true,
  dnsFailure: true,
  highCpu: true,
  highMemory: true,
  highDisk: true,
  serviceDown: true,
  deployFailed: true,
  providerSuspended: true,
};

const DEFAULT_THRESHOLDS: AlertThresholds = {
  responseMs: 3000,
  cpuPercent: 85,
  memoryPercent: 90,
  diskPercent: 85,
  sslDaysBefore: 14,
  failureThreshold: 2,
};

@Component({
  selector: 'app-monitoring-project',
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './monitoring-project.html',
})
export class MonitoringProject implements OnInit {
  protected readonly typeLabels = TYPE_LABELS;
  protected readonly typeHints = TYPE_HINTS;
  protected readonly types: ConnectionType[] = ['http', 'ssh', 'render', 'netlify', 'coolify'];
  protected readonly windowOptions = [
    { hours: 6, label: '6 h' },
    { hours: 24, label: '24 h' },
    { hours: 168, label: '7 d' },
    { hours: 720, label: '30 d' },
  ];

  protected readonly dashboard = signal<ProjectMonitoringDashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly hours = signal(24);
  /** ids of the connections whose manual check is running right now */
  protected readonly checking = signal<Set<string>>(new Set());
  protected readonly expanded = signal<Set<string>>(new Set());

  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly showAlertSettings = signal(false);

  protected projectId = '';

  // --- form -----------------------------------------------------------------
  protected type: ConnectionType = 'http';
  protected name = '';
  protected isActive = true;
  protected intervalMinutes = 5;
  protected url = '';
  protected expectedStatus = 200;
  protected expectedText = '';
  protected host = '';
  protected port = 22;
  protected username = '';
  protected password = '';
  protected privateKey = '';
  protected passphrase = '';
  protected serviceId = '';
  protected providerBaseUrl = '';
  protected apiToken = '';
  protected alertsEnabled = true;
  protected alertEmail = true;
  protected alertWhatsapp = true;
  protected extraEmails = '';
  protected extraPhones = '';
  protected repeatAfterMinutes = 60;
  protected events: AlertEvents = { ...DEFAULT_EVENTS };
  protected thresholds: AlertThresholds = { ...DEFAULT_THRESHOLDS };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly monitoringService: MonitoringService,
  ) {}

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
  }

  load(): void {
    if (!this.projectId) return;
    this.loading.set(true);
    this.monitoringService.projectDashboard(this.projectId, this.hours()).subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el monitoreo del proyecto.');
        this.loading.set(false);
      },
    });
  }

  setHours(hours: number): void {
    if (this.hours() === hours) return;
    this.hours.set(hours);
    this.load();
  }

  protected readonly items = (): ConnectionDashboard[] => this.dashboard()?.connections ?? [];

  // --- detalle expandible ----------------------------------------------------

  isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  toggleExpanded(id: string): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // --- chequeo manual --------------------------------------------------------

  isChecking(id: string): boolean {
    return this.checking().has(id);
  }

  runCheck(connection: ProjectConnection): void {
    this.checking.update((current) => new Set(current).add(connection._id));
    this.monitoringService.check(connection._id).subscribe({
      next: () => {
        this.releaseCheck(connection._id);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.releaseCheck(connection._id);
        this.error.set(
          (err.error as { message?: string })?.message ?? 'No se pudo ejecutar el chequeo.',
        );
      },
    });
  }

  private releaseCheck(id: string): void {
    this.checking.update((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  // --- alta / edición --------------------------------------------------------

  openCreate(): void {
    this.resetForm();
    this.formOpen.set(true);
  }

  openEdit(connection: ProjectConnection): void {
    this.resetForm();
    this.editingId.set(connection._id);
    this.type = connection.type;
    this.name = connection.name;
    this.isActive = connection.isActive;
    this.intervalMinutes = connection.intervalMinutes;
    this.url = connection.url ?? '';
    this.expectedStatus = connection.expectedStatus ?? 200;
    this.expectedText = connection.expectedText ?? '';
    this.host = connection.host ?? '';
    this.port = connection.port ?? 22;
    this.username = connection.username ?? '';
    this.serviceId = connection.serviceId ?? '';
    this.providerBaseUrl = connection.providerBaseUrl ?? '';
    const alerts = connection.alerts;
    this.alertsEnabled = alerts?.enabled ?? true;
    this.alertEmail = alerts?.email ?? true;
    this.alertWhatsapp = alerts?.whatsapp ?? true;
    this.extraEmails = (alerts?.extraEmails ?? []).join(', ');
    this.extraPhones = (alerts?.extraPhones ?? []).join(', ');
    this.repeatAfterMinutes = alerts?.repeatAfterMinutes ?? 60;
    this.events = { ...DEFAULT_EVENTS, ...(alerts?.events ?? {}) };
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...(alerts?.thresholds ?? {}) };
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.resetForm();
  }

  private resetForm(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.showAlertSettings.set(false);
    this.type = 'http';
    this.name = '';
    this.isActive = true;
    this.intervalMinutes = 5;
    this.url = '';
    this.expectedStatus = 200;
    this.expectedText = '';
    this.host = '';
    this.port = 22;
    this.username = '';
    this.password = '';
    this.privateKey = '';
    this.passphrase = '';
    this.serviceId = '';
    this.providerBaseUrl = '';
    this.apiToken = '';
    this.alertsEnabled = true;
    this.alertEmail = true;
    this.alertWhatsapp = true;
    this.extraEmails = '';
    this.extraPhones = '';
    this.repeatAfterMinutes = 60;
    this.events = { ...DEFAULT_EVENTS };
    this.thresholds = { ...DEFAULT_THRESHOLDS };
  }

  get isProvider(): boolean {
    return this.type === 'render' || this.type === 'netlify' || this.type === 'coolify';
  }

  get canSubmit(): boolean {
    if (this.name.trim().length < 2) return false;
    if (this.type === 'http') return /^https?:\/\/.+/.test(this.url.trim());
    if (this.type === 'ssh') {
      if (!this.host.trim() || !this.username.trim()) return false;
      // On create at least one credential is required; on edit the stored one is kept.
      return !!this.editingId() || !!this.password.trim() || !!this.privateKey.trim();
    }
    if (!this.serviceId.trim()) return false;
    if (this.type === 'coolify' && !this.providerBaseUrl.trim()) return false;
    return !!this.editingId() || !!this.apiToken.trim();
  }

  submit(): void {
    if (!this.canSubmit || this.saving()) return;
    const editingId = this.editingId();
    const payload: Partial<CreateConnectionPayload> = {
      name: this.name.trim(),
      isActive: this.isActive,
      intervalMinutes: Number(this.intervalMinutes) || 5,
      alerts: {
        enabled: this.alertsEnabled,
        email: this.alertEmail,
        whatsapp: this.alertWhatsapp,
        extraEmails: splitList(this.extraEmails),
        extraPhones: splitList(this.extraPhones),
        repeatAfterMinutes: Number(this.repeatAfterMinutes) || 60,
        events: { ...this.events },
        thresholds: numeric(this.thresholds),
      },
    };

    if (this.type === 'http') {
      payload.url = this.url.trim();
      payload.expectedStatus = Number(this.expectedStatus) || 200;
      payload.expectedText = this.expectedText.trim() || undefined;
    } else if (this.type === 'ssh') {
      payload.host = this.host.trim();
      payload.port = Number(this.port) || 22;
      payload.username = this.username.trim();
      if (this.password.trim()) payload.password = this.password;
      if (this.privateKey.trim()) payload.privateKey = this.privateKey;
      if (this.passphrase.trim()) payload.passphrase = this.passphrase;
    } else {
      payload.serviceId = this.serviceId.trim();
      if (this.type === 'coolify') payload.providerBaseUrl = this.providerBaseUrl.trim();
      if (this.apiToken.trim()) payload.apiToken = this.apiToken.trim();
    }

    this.saving.set(true);
    this.formError.set(null);
    const onError = (err: HttpErrorResponse) => {
      this.formError.set(
        (err.error as { message?: string | string[] })?.message?.toString() ??
          'No se pudo guardar la conexión.',
      );
      this.saving.set(false);
    };
    const onDone = () => {
      this.saving.set(false);
      this.closeForm();
      this.load();
    };

    if (editingId) {
      this.monitoringService.update(editingId, payload).subscribe({ next: onDone, error: onError });
      return;
    }
    this.monitoringService
      .create({ ...payload, project: this.projectId, type: this.type } as CreateConnectionPayload)
      .subscribe({ next: onDone, error: onError });
  }

  remove(connection: ProjectConnection): void {
    if (!confirm(`¿Eliminar la conexión "${connection.name}"? Se borra también su historial.`))
      return;
    this.monitoringService.remove(connection._id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('No se pudo eliminar la conexión.'),
    });
  }

  toggleActive(connection: ProjectConnection): void {
    this.monitoringService.update(connection._id, { isActive: !connection.isActive }).subscribe({
      next: () => this.load(),
      error: () => this.error.set('No se pudo cambiar el estado de la conexión.'),
    });
  }

  // --- opciones visibles según el tipo ---------------------------------------

  eventsFor(type: ConnectionType): EventOption[] {
    return EVENT_OPTIONS.filter((option) => option.types.includes(type));
  }

  thresholdsFor(type: ConnectionType): ThresholdOption[] {
    return THRESHOLD_OPTIONS.filter((option) => option.types.includes(type));
  }

  /** Alerts the admin left on, to show them as chips on the card. */
  activeEvents(connection: ProjectConnection): EventOption[] {
    const events = connection.alerts?.events;
    return this.eventsFor(connection.type).filter((option) => events?.[option.key] !== false);
  }

  // --- presentación ----------------------------------------------------------

  typeLabel(type: ConnectionType): string {
    return TYPE_LABELS[type];
  }

  typeIcon(type: ConnectionType): string {
    return TYPE_ICONS[type];
  }

  statusLabel(status: ConnectionStatus): string {
    return STATUS_LABELS[status] ?? STATUS_LABELS.unknown;
  }

  statusClass(status: ConnectionStatus): string {
    return STATUS_CLASSES[status] ?? STATUS_CLASSES.unknown;
  }

  statusIcon(status: ConnectionStatus): string {
    return STATUS_ICONS[status] ?? STATUS_ICONS.unknown;
  }

  /** Where the connection points, in one line, for the card header. */
  targetOf(connection: ProjectConnection): string {
    if (connection.type === 'http') return connection.url ?? '';
    if (connection.type === 'ssh') {
      return `${connection.username ?? ''}@${connection.host ?? ''}:${connection.port ?? 22}`;
    }
    return connection.serviceId ?? '';
  }

  uptimeLabel(item: ConnectionDashboard): string {
    if (item.uptimePercent === null) return 'sin datos';
    return `${item.uptimePercent}%`;
  }

  uptimeClass(item: ConnectionDashboard): string {
    if (item.uptimePercent === null) return 'text-on-surface-variant';
    if (item.uptimePercent >= 99) return 'text-emerald-600';
    if (item.uptimePercent >= 95) return 'text-amber-600';
    return 'text-error';
  }

  latencyLabel(value: number | null): string {
    return value === null ? '—' : `${Math.round(value)} ms`;
  }

  /** Polyline for the latency sparkline, normalised to a 100 x 32 viewBox. */
  sparkline(item: ConnectionDashboard): string {
    const points = item.history.filter((sample) => sample.latencyMs !== null);
    if (points.length < 2) return '';
    const values = points.map((sample) => sample.latencyMs as number);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    return points
      .map((sample, index) => {
        const x = (index / (points.length - 1)) * 100;
        const y = 30 - (((sample.latencyMs as number) - min) / span) * 28;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  /** One bar per check so an outage is visible even without latency. */
  statusBars(item: ConnectionDashboard): { status: ConnectionStatus; at: string }[] {
    return item.history.map((sample) => ({ status: sample.status, at: sample.checkedAt }));
  }

  barClass(status: ConnectionStatus): string {
    return {
      up: 'bg-emerald-500',
      degraded: 'bg-amber-500',
      down: 'bg-error',
      unknown: 'bg-surface-container-high',
    }[status];
  }

  metricRows(item: ConnectionDashboard): MetricRow[] {
    const metrics = item.lastMetrics ?? {};
    const keys = Object.keys(metrics);
    const ordered = [
      ...METRIC_ORDER.filter((key) => keys.includes(key)),
      ...keys.filter((key) => !METRIC_ORDER.includes(key)),
    ];
    return ordered
      .map((key) => this.toRow(key, metrics[key], item.connection.alerts?.thresholds))
      .filter((row): row is MetricRow => row !== null);
  }

  private toRow(
    key: string,
    value: CheckMetrics[string],
    thresholds: AlertThresholds | undefined,
  ): MetricRow | null {
    if (value === null || value === undefined || value === '') return null;
    const def = METRIC_DEFS[key] ?? { label: key, icon: 'query_stats', format: 'text' as const };
    return {
      key,
      label: def.label,
      icon: def.icon,
      value: formatMetric(value, def.format),
      tone: toneFor(key, value, def, thresholds),
    };
  }
}

function splitList(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function numeric(thresholds: AlertThresholds): AlertThresholds {
  // ngModel on a number input can hand back strings; the API expects numbers.
  return Object.fromEntries(
    Object.entries(thresholds).map(([key, value]) => [key, Number(value) || 0]),
  ) as unknown as AlertThresholds;
}

function formatMetric(value: CheckMetrics[string], format: MetricFormat): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  const num = Number(value);
  switch (format) {
    case 'ms':
      return `${Math.round(num)} ms`;
    case 'percent':
      return `${Math.round(num)}%`;
    case 'days':
      return num === 1 ? '1 día' : `${Math.round(num)} días`;
    case 'mb':
      return num >= 1024 ? `${(num / 1024).toFixed(1)} GB` : `${Math.round(num)} MB`;
    case 'gb':
      return `${num} GB`;
    case 'bytes':
      return num >= 1024 * 1024
        ? `${(num / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(num / 1024)} KB`;
    case 'date':
      return new Date(String(value)).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    case 'number':
      return String(value);
    default:
      return String(value);
  }
}

/** Paints the value red/amber when it is the thing that would trigger an alert. */
function toneFor(
  key: string,
  value: CheckMetrics[string],
  def: MetricDef,
  thresholds: AlertThresholds | undefined,
): MetricRow['tone'] {
  if (typeof value === 'boolean') {
    const bad = def.invert ? value : !value;
    return bad ? 'bad' : 'good';
  }
  const num = Number(value);
  const limits = { ...DEFAULT_THRESHOLDS, ...(thresholds ?? {}) };
  if (key === 'cpuPercent') return num >= limits.cpuPercent ? 'bad' : 'normal';
  if (key === 'memoryPercent') return num >= limits.memoryPercent ? 'bad' : 'normal';
  if (key === 'diskPercent') return num >= limits.diskPercent ? 'bad' : 'normal';
  if (key === 'responseTimeMs') return num >= limits.responseMs ? 'warn' : 'normal';
  if (key === 'sslDaysToExpiry') {
    if (num < 0) return 'bad';
    return num <= limits.sslDaysBefore ? 'warn' : 'good';
  }
  if (key === 'statusCode') return num >= 400 ? 'bad' : 'normal';
  if (key === 'failedServices' || key === 'containersStopped') return num > 0 ? 'bad' : 'normal';
  if (key === 'sslError') return 'bad';
  if (key === 'deployStatus') {
    const status = String(value).toLowerCase();
    if (['build_failed', 'update_failed', 'error', 'canceled', 'failed'].includes(status)) {
      return 'bad';
    }
    return 'good';
  }
  return 'normal';
}
