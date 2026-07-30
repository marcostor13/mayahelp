export type ConnectionType = 'http' | 'ssh' | 'render' | 'netlify' | 'coolify';
export type ConnectionStatus = 'unknown' | 'up' | 'degraded' | 'down';

export interface AlertEvents {
  down: boolean;
  recovered: boolean;
  slow: boolean;
  unexpectedResponse: boolean;
  sslInvalid: boolean;
  sslExpiring: boolean;
  dnsFailure: boolean;
  highCpu: boolean;
  highMemory: boolean;
  highDisk: boolean;
  serviceDown: boolean;
  deployFailed: boolean;
  providerSuspended: boolean;
}

export interface AlertThresholds {
  responseMs: number;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  sslDaysBefore: number;
  failureThreshold: number;
}

export interface AlertSettings {
  enabled: boolean;
  email: boolean;
  whatsapp: boolean;
  extraEmails: string[];
  extraPhones: string[];
  repeatAfterMinutes: number;
  events: AlertEvents;
  thresholds: AlertThresholds;
}

export interface ProjectConnection {
  _id: string;
  project: string;
  name: string;
  type: ConnectionType;
  isActive: boolean;
  intervalMinutes: number;
  url?: string;
  expectedStatus?: number;
  expectedText?: string;
  host?: string;
  port?: number;
  username?: string;
  serviceId?: string;
  providerBaseUrl?: string;
  /** Secrets are never returned; only whether they are set. */
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasApiToken: boolean;
  alerts: AlertSettings;
  status: ConnectionStatus;
  lastCheckedAt: string | null;
  lastStatusChangeAt: string | null;
  consecutiveFailures: number;
  lastError?: string;
  createdAt: string;
}

export interface CreateConnectionPayload {
  project: string;
  name: string;
  type: ConnectionType;
  isActive?: boolean;
  intervalMinutes?: number;
  url?: string;
  expectedStatus?: number;
  expectedText?: string;
  host?: string;
  port?: number;
  username?: string;
  serviceId?: string;
  providerBaseUrl?: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  apiToken?: string;
  alerts?: Partial<AlertSettings>;
}

export type CheckMetrics = Record<string, number | string | boolean | null>;

export interface MonitorSample {
  checkedAt: string;
  status: ConnectionStatus;
  latencyMs: number | null;
}

export interface ConnectionDashboard {
  connection: ProjectConnection;
  uptimePercent: number | null;
  checksCount: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
  lastMetrics: CheckMetrics;
  history: MonitorSample[];
}

export interface ProjectMonitoringDashboard {
  project: { _id: string; name: string; status: string };
  windowHours: number;
  connections: ConnectionDashboard[];
}

export interface MonitoringOverviewRow {
  projectId: string;
  projectName: string;
  total: number;
  up: number;
  degraded: number;
  down: number;
  unknown: number;
  lastCheckedAt: string | null;
}

export interface RunCheckResult {
  connection: ProjectConnection;
  result: {
    status: ConnectionStatus;
    latencyMs: number | null;
    metrics: CheckMetrics;
    error?: string;
  };
  alerts: string[];
}
