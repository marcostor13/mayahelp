import { MonitoringProject } from './monitoring-project';
import { ActivatedRoute } from '@angular/router';
import { MonitoringService } from '../../core/services/monitoring.service';
import {
  ConnectionDashboard,
  ConnectionStatus,
  ConnectionType,
  ProjectConnection,
} from '../../core/models/monitoring.model';

/**
 * The form fields are `protected` because only the template writes them;
 * the tests reach them through this view of the component.
 */
interface TestPage {
  type: ConnectionType;
  name: string;
  url: string;
  host: string;
  username: string;
  password: string;
  serviceId: string;
  apiToken: string;
  providerBaseUrl: string;
  readonly canSubmit: boolean;
  openCreate(): void;
  openEdit(connection: ProjectConnection): void;
  metricRows(
    item: ConnectionDashboard,
  ): { key: string; label: string; value: string; tone: string }[];
  sparkline(item: ConnectionDashboard): string;
  eventsFor(type: ConnectionType): { key: string }[];
  thresholdsFor(type: ConnectionType): { key: string }[];
}

function component(): TestPage {
  const route = { snapshot: { paramMap: { get: () => 'p1' } } } as unknown as ActivatedRoute;
  return new MonitoringProject(route, {} as MonitoringService) as unknown as TestPage;
}

function connection(overrides: Partial<ProjectConnection> = {}): ProjectConnection {
  return {
    _id: 'c1',
    project: 'p1',
    name: 'Producción',
    type: 'http' as ConnectionType,
    isActive: true,
    intervalMinutes: 5,
    hasPassword: false,
    hasPrivateKey: false,
    hasApiToken: false,
    alerts: {
      enabled: true,
      email: true,
      whatsapp: true,
      extraEmails: [],
      extraPhones: [],
      repeatAfterMinutes: 60,
      events: {
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
      },
      thresholds: {
        responseMs: 3000,
        cpuPercent: 85,
        memoryPercent: 90,
        diskPercent: 85,
        sslDaysBefore: 14,
        failureThreshold: 2,
      },
    },
    status: 'up' as ConnectionStatus,
    lastCheckedAt: null,
    lastStatusChangeAt: null,
    consecutiveFailures: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function item(overrides: Partial<ConnectionDashboard> = {}): ConnectionDashboard {
  return {
    connection: connection(),
    uptimePercent: 100,
    checksCount: 10,
    avgLatencyMs: 120,
    maxLatencyMs: 300,
    lastMetrics: {},
    history: [],
    ...overrides,
  };
}

describe('MonitoringProject metrics', () => {
  it('labels and orders the metrics instead of dumping raw keys', () => {
    const rows = component().metricRows(
      item({ lastMetrics: { sslValid: true, statusCode: 200, responseTimeMs: 140 } }),
    );

    expect(rows.map((row) => row.key)).toEqual(['statusCode', 'responseTimeMs', 'sslValid']);
    expect(rows[1].label).toBe('Tiempo de respuesta');
    expect(rows[1].value).toBe('140 ms');
    expect(rows[2].value).toBe('Sí');
  });

  it('skips metrics without a value so the panel stays readable', () => {
    const rows = component().metricRows(
      item({ lastMetrics: { server: '', sslError: null, statusCode: 200 } }),
    );

    expect(rows.map((row) => row.key)).toEqual(['statusCode']);
  });

  it('still shows a metric the backend adds later, without a label', () => {
    const rows = component().metricRows(item({ lastMetrics: { nuevaMetrica: 7 } }));

    expect(rows).toEqual([
      expect.objectContaining({ key: 'nuevaMetrica', label: 'nuevaMetrica', value: '7' }),
    ]);
  });

  it('paints a value red only once it crosses the configured threshold', () => {
    const strict = connection();
    strict.alerts.thresholds = { ...strict.alerts.thresholds, diskPercent: 50 };
    const toneOf = (rows: { key: string; tone: string }[], key: string) =>
      rows.find((row) => row.key === key)?.tone;

    const relaxed = component().metricRows(item({ lastMetrics: { diskPercent: 60 } }));
    const tight = component().metricRows(
      item({ connection: strict, lastMetrics: { diskPercent: 60 } }),
    );

    expect(toneOf(relaxed, 'diskPercent')).toBe('normal');
    expect(toneOf(tight, 'diskPercent')).toBe('bad');
  });

  it('warns about a certificate close to expiring and flags an expired one', () => {
    const soon = component().metricRows(item({ lastMetrics: { sslDaysToExpiry: 5 } }));
    const expired = component().metricRows(item({ lastMetrics: { sslDaysToExpiry: -1 } }));
    const fine = component().metricRows(item({ lastMetrics: { sslDaysToExpiry: 90 } }));

    expect(soon[0].tone).toBe('warn');
    expect(soon[0].value).toBe('5 días');
    expect(expired[0].tone).toBe('bad');
    expect(fine[0].tone).toBe('good');
  });

  it('treats "suspended: true" as bad news even though it is a true boolean', () => {
    const rows = component().metricRows(item({ lastMetrics: { suspended: true } }));

    expect(rows[0].tone).toBe('bad');
  });
});

describe('MonitoringProject options by type', () => {
  it('only offers the alerts that the connection type can produce', () => {
    const page = component();

    expect(page.eventsFor('http').map((option) => option.key)).toEqual([
      'down',
      'recovered',
      'slow',
      'unexpectedResponse',
      'sslInvalid',
      'sslExpiring',
      'dnsFailure',
    ]);
    expect(page.eventsFor('ssh').map((option) => option.key)).toContain('highDisk');
    expect(page.eventsFor('ssh').map((option) => option.key)).not.toContain('sslInvalid');
    expect(page.eventsFor('render').map((option) => option.key)).toContain('deployFailed');
  });

  it('only asks for the thresholds those alerts use', () => {
    const page = component();

    expect(page.thresholdsFor('render').map((option) => option.key)).toEqual(['failureThreshold']);
    expect(page.thresholdsFor('ssh').map((option) => option.key)).toContain('cpuPercent');
  });
});

describe('MonitoringProject form validation', () => {
  it('requires a credential when creating an SSH connection but not when editing it', () => {
    const page = component();
    page.openCreate();
    page.type = 'ssh';
    page.name = 'Servidor';
    page.host = '10.0.0.1';
    page.username = 'ubuntu';

    expect(page.canSubmit).toBe(false);

    page.password = 'secreto';
    expect(page.canSubmit).toBe(true);

    // Editing keeps the stored key: asking for it again would force a re-paste.
    page.openEdit(connection({ type: 'ssh', host: '10.0.0.1', username: 'ubuntu', port: 22 }));
    expect(page.canSubmit).toBe(true);
  });

  it('rejects a site without a real URL', () => {
    const page = component();
    page.openCreate();
    page.name = 'Sitio';
    page.url = 'miapp.com';

    expect(page.canSubmit).toBe(false);

    page.url = 'https://miapp.com';
    expect(page.canSubmit).toBe(true);
  });

  it('asks Coolify for the instance URL as well as the application', () => {
    const page = component();
    page.openCreate();
    page.type = 'coolify';
    page.name = 'App';
    page.serviceId = 'uuid-1';
    page.apiToken = 'token';

    expect(page.canSubmit).toBe(false);

    page.providerBaseUrl = 'https://coolify.empresa.com';
    expect(page.canSubmit).toBe(true);
  });
});

describe('MonitoringProject history', () => {
  it('normalises the latency history into a sparkline', () => {
    const page = component();
    const points = page.sparkline(
      item({
        history: [
          { checkedAt: '2026-07-30T10:00:00.000Z', status: 'up', latencyMs: 100 },
          { checkedAt: '2026-07-30T10:05:00.000Z', status: 'up', latencyMs: 200 },
          { checkedAt: '2026-07-30T10:10:00.000Z', status: 'down', latencyMs: null },
        ],
      }),
    );

    // The failed check has no latency, so only the two measured points are drawn.
    expect(points).toBe('0.0,30.0 100.0,2.0');
  });

  it('draws nothing when there is not enough history yet', () => {
    expect(
      component().sparkline(
        item({
          history: [{ checkedAt: '2026-07-30T10:00:00.000Z', status: 'up', latencyMs: 100 }],
        }),
      ),
    ).toBe('');
  });
});
