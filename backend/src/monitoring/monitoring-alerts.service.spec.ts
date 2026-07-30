import { MonitoringAlertsService } from './monitoring-alerts.service';
import {
  ConnectionStatus,
  ConnectionType,
  ProjectConnectionDocument,
} from './schemas/project-connection.schema';
import { CheckResult } from './checkers/http-checker';
import { NotificationsService } from '../notifications/notifications.service';

function connection(
  overrides: Partial<{
    events: Record<string, boolean>;
    thresholds: Record<string, number>;
  }> = {},
): ProjectConnectionDocument {
  return {
    name: 'Producción',
    type: ConnectionType.HTTP,
    url: 'https://acme.com',
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
        ...overrides.events,
      },
      thresholds: {
        responseMs: 3000,
        cpuPercent: 85,
        memoryPercent: 90,
        diskPercent: 85,
        sslDaysBefore: 14,
        failureThreshold: 2,
        ...overrides.thresholds,
      },
    },
    lastAlertAt: {},
  } as unknown as ProjectConnectionDocument;
}

function result(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    status: ConnectionStatus.UP,
    latencyMs: 120,
    metrics: {},
    ...overrides,
  };
}

describe('MonitoringAlertsService.buildAlerts', () => {
  const service = new MonitoringAlertsService({} as NotificationsService);
  const keys = (alerts: { key: string }[]) => alerts.map((a) => a.key);

  it('waits for the failure threshold before declaring it down', () => {
    const down = result({ status: ConnectionStatus.DOWN, error: 'timeout' });

    // One failure can be a blip; the default threshold is two.
    expect(
      keys(service.buildAlerts(connection(), down, ConnectionStatus.UP, 1)),
    ).not.toContain('down');
    expect(
      keys(service.buildAlerts(connection(), down, ConnectionStatus.UP, 2)),
    ).toContain('down');
  });

  it('alerts the recovery only when it was failing before', () => {
    const up = result();

    expect(
      keys(service.buildAlerts(connection(), up, ConnectionStatus.DOWN, 0)),
    ).toContain('recovered');
    expect(
      keys(service.buildAlerts(connection(), up, ConnectionStatus.UP, 0)),
    ).not.toContain('recovered');
  });

  it('reports slowness only while the service still answers', () => {
    const slow = result({ latencyMs: 9000, metrics: { responseTimeMs: 9000 } });
    expect(
      keys(service.buildAlerts(connection(), slow, ConnectionStatus.UP, 0)),
    ).toContain('slow');

    // A down service is already covered by the "down" alert; "slow" would be noise.
    const downAndSlow = result({
      status: ConnectionStatus.DOWN,
      latencyMs: 9000,
      metrics: { responseTimeMs: 9000 },
    });
    expect(
      keys(
        service.buildAlerts(connection(), downAndSlow, ConnectionStatus.UP, 2),
      ),
    ).not.toContain('slow');
  });

  it('detects certificate, DNS and resource problems', () => {
    const bad = result({
      status: ConnectionStatus.DEGRADED,
      metrics: {
        sslValid: false,
        sslError: 'certificate has expired',
        sslDaysToExpiry: 3,
        sslValidTo: '2026-08-05T00:00:00.000Z',
        dnsResolved: false,
        cpuPercent: 96,
        memoryPercent: 93,
        diskPercent: 91,
        failedServices: 2,
      },
    });

    expect(
      keys(service.buildAlerts(connection(), bad, ConnectionStatus.UP, 0)),
    ).toEqual(
      expect.arrayContaining([
        'ssl-invalid',
        'ssl-expiring',
        'dns',
        'cpu',
        'memory',
        'disk',
        'services',
      ]),
    );
  });

  it('does not warn about a certificate that is still far from expiring', () => {
    const fine = result({ metrics: { sslValid: true, sslDaysToExpiry: 60 } });

    expect(
      keys(service.buildAlerts(connection(), fine, ConnectionStatus.UP, 0)),
    ).not.toContain('ssl-expiring');
  });

  it('flags failed deploys and suspended services of the providers', () => {
    const provider = result({
      status: ConnectionStatus.DEGRADED,
      metrics: { deployStatus: 'build_failed', suspended: true },
    });

    expect(
      keys(service.buildAlerts(connection(), provider, ConnectionStatus.UP, 0)),
    ).toEqual(expect.arrayContaining(['deploy', 'suspended']));
  });

  it('respects the events the admin switched off', () => {
    const noisy = result({
      metrics: { cpuPercent: 99, diskPercent: 99, responseTimeMs: 9000 },
    });
    const quiet = connection({
      events: { highCpu: false, highDisk: false, slow: false },
    });

    expect(service.buildAlerts(quiet, noisy, ConnectionStatus.UP, 0)).toEqual(
      [],
    );
  });

  it('honours custom thresholds', () => {
    const strict = connection({ thresholds: { diskPercent: 50 } });
    const half = result({ metrics: { diskPercent: 60 } });

    expect(
      keys(service.buildAlerts(strict, half, ConnectionStatus.UP, 0)),
    ).toContain('disk');
    expect(
      keys(service.buildAlerts(connection(), half, ConnectionStatus.UP, 0)),
    ).not.toContain('disk');
  });
});

describe('MonitoringAlertsService.dispatch', () => {
  function serviceWithSpy() {
    const sent: string[] = [];
    const notifications = {
      notifyMonitoringAlert: (params: { title: string }) => {
        sent.push(params.title);
        return Promise.resolve();
      },
    } as unknown as NotificationsService;
    return { service: new MonitoringAlertsService(notifications), sent };
  }

  it('does not repeat the same alert inside the repeat window', async () => {
    const { service, sent } = serviceWithSpy();
    const conn = connection();
    conn.lastAlertAt = { down: new Date() };

    const keys = await service.dispatch(conn, 'Portal Acme', [
      { key: 'down', severity: 'critical', title: 'caído', detail: '' },
    ]);

    expect(keys).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('always sends the recovery, even right after the outage alert', async () => {
    const { service, sent } = serviceWithSpy();
    const conn = connection();
    conn.lastAlertAt = { recovered: new Date() };

    const keys = await service.dispatch(conn, 'Portal Acme', [
      { key: 'recovered', severity: 'info', title: 'volvió', detail: '' },
    ]);

    expect(keys).toEqual(['recovered']);
    expect(sent).toEqual(['volvió']);
  });

  it('sends nothing when alerts are disabled for the connection', async () => {
    const { service, sent } = serviceWithSpy();
    const conn = connection();
    conn.alerts.enabled = false;

    await service.dispatch(conn, 'Portal Acme', [
      { key: 'down', severity: 'critical', title: 'caído', detail: '' },
    ]);

    expect(sent).toEqual([]);
  });
});
