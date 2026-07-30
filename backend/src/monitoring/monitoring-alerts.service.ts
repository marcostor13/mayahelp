import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ConnectionStatus,
  ProjectConnectionDocument,
} from './schemas/project-connection.schema';
import { CheckResult } from './checkers/http-checker';

export interface MonitoringAlert {
  /** Stable key used to rate-limit repeats of the same problem. */
  key: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
}

/**
 * Turns a check result into the alerts worth sending.
 *
 * Two rules keep the noise down: a connection is only "down" after
 * `failureThreshold` consecutive failures, and the same alert key is not repeated
 * until `repeatAfterMinutes` have passed.
 */
@Injectable()
export class MonitoringAlertsService {
  private readonly logger = new Logger(MonitoringAlertsService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  buildAlerts(
    connection: ProjectConnectionDocument,
    result: CheckResult,
    previousStatus: ConnectionStatus,
    consecutiveFailures: number,
  ): MonitoringAlert[] {
    const alerts: MonitoringAlert[] = [];
    const { events, thresholds } = connection.alerts;
    const metrics = result.metrics ?? {};
    const failing =
      result.status === ConnectionStatus.DOWN ||
      result.status === ConnectionStatus.DEGRADED;

    if (
      events.down &&
      result.status === ConnectionStatus.DOWN &&
      consecutiveFailures >= thresholds.failureThreshold
    ) {
      alerts.push({
        key: 'down',
        severity: 'critical',
        title: `${connection.name} está caído`,
        detail:
          result.error ??
          `No responde desde hace ${consecutiveFailures} chequeo(s).`,
      });
    }

    if (
      events.recovered &&
      result.status === ConnectionStatus.UP &&
      (previousStatus === ConnectionStatus.DOWN ||
        previousStatus === ConnectionStatus.DEGRADED)
    ) {
      alerts.push({
        key: 'recovered',
        severity: 'info',
        title: `${connection.name} volvió a funcionar`,
        detail: 'El servicio responde con normalidad.',
      });
    }

    if (
      events.unexpectedResponse &&
      result.status === ConnectionStatus.DEGRADED &&
      (metrics.contentOk === false || metrics.statusOk === false)
    ) {
      alerts.push({
        key: 'unexpected-response',
        severity: 'warning',
        title: `${connection.name} responde distinto de lo esperado`,
        detail: result.error ?? 'La respuesta no coincide con lo configurado.',
      });
    }

    const latency = Number(metrics.responseTimeMs ?? result.latencyMs ?? 0);
    if (
      events.slow &&
      !failing &&
      latency > 0 &&
      latency > thresholds.responseMs
    ) {
      alerts.push({
        key: 'slow',
        severity: 'warning',
        title: `${connection.name} está lento`,
        detail: `Tardó ${latency} ms (límite ${thresholds.responseMs} ms).`,
      });
    }

    if (events.sslInvalid && metrics.sslValid === false) {
      alerts.push({
        key: 'ssl-invalid',
        severity: 'critical',
        title: `Certificado inválido en ${connection.name}`,
        detail: String(metrics.sslError || 'El certificado TLS no es válido.'),
      });
    }

    const sslDays = Number(metrics.sslDaysToExpiry ?? NaN);
    if (
      events.sslExpiring &&
      Number.isFinite(sslDays) &&
      sslDays >= 0 &&
      sslDays <= thresholds.sslDaysBefore
    ) {
      alerts.push({
        key: 'ssl-expiring',
        severity: 'warning',
        title: `El certificado de ${connection.name} vence en ${sslDays} día(s)`,
        detail: `Expira el ${String(metrics.sslValidTo ?? '').slice(0, 10)}.`,
      });
    }

    if (events.dnsFailure && metrics.dnsResolved === false) {
      alerts.push({
        key: 'dns',
        severity: 'critical',
        title: `El dominio de ${connection.name} no resuelve`,
        detail:
          result.error ??
          'La consulta DNS falló: revisá el registrador y los registros del dominio.',
      });
    }

    const cpu = Number(metrics.cpuPercent ?? NaN);
    if (
      events.highCpu &&
      Number.isFinite(cpu) &&
      cpu >= thresholds.cpuPercent
    ) {
      alerts.push({
        key: 'cpu',
        severity: 'warning',
        title: `CPU alta en ${connection.name}`,
        detail: `Uso ${cpu}% (límite ${thresholds.cpuPercent}%).`,
      });
    }

    const memory = Number(metrics.memoryPercent ?? NaN);
    if (
      events.highMemory &&
      Number.isFinite(memory) &&
      memory >= thresholds.memoryPercent
    ) {
      alerts.push({
        key: 'memory',
        severity: 'warning',
        title: `Memoria alta en ${connection.name}`,
        detail: `Uso ${memory}% (límite ${thresholds.memoryPercent}%).`,
      });
    }

    const disk = Number(metrics.diskPercent ?? NaN);
    if (
      events.highDisk &&
      Number.isFinite(disk) &&
      disk >= thresholds.diskPercent
    ) {
      alerts.push({
        key: 'disk',
        severity: 'critical',
        title: `Disco casi lleno en ${connection.name}`,
        detail: `Uso ${disk}% (límite ${thresholds.diskPercent}%). Cuando llega a 100% el servidor deja de escribir.`,
      });
    }

    const failedServices = Number(metrics.failedServices ?? 0);
    const stoppedContainers = Number(metrics.containersStopped ?? 0);
    if (events.serviceDown && (failedServices > 0 || stoppedContainers > 0)) {
      alerts.push({
        key: 'services',
        severity: 'warning',
        title: `Servicios caídos en ${connection.name}`,
        detail: [
          failedServices > 0
            ? `${failedServices} unidad(es) systemd en fallo`
            : '',
          stoppedContainers > 0
            ? `${stoppedContainers} contenedor(es) detenido(s)`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }

    const deployStatus = String(metrics.deployStatus ?? '').toLowerCase();
    if (
      events.deployFailed &&
      ['error', 'build_failed', 'update_failed', 'failed'].includes(
        deployStatus,
      )
    ) {
      alerts.push({
        key: 'deploy',
        severity: 'warning',
        title: `Deploy fallido en ${connection.name}`,
        detail:
          result.error ?? `El último deploy terminó en "${deployStatus}".`,
      });
    }

    if (events.providerSuspended && metrics.suspended === true) {
      alerts.push({
        key: 'suspended',
        severity: 'critical',
        title: `${connection.name} está suspendido en el proveedor`,
        detail: 'Revisá el estado de la cuenta o del plan.',
      });
    }

    return alerts;
  }

  /** Applies the repeat window and sends what survives. Returns the keys actually sent. */
  async dispatch(
    connection: ProjectConnectionDocument,
    projectName: string,
    alerts: MonitoringAlert[],
  ): Promise<string[]> {
    if (!connection.alerts.enabled || alerts.length === 0) return [];

    const now = Date.now();
    const windowMs = Math.max(1, connection.alerts.repeatAfterMinutes) * 60_000;
    const sent: string[] = [];

    for (const alert of alerts) {
      const lastSent = connection.lastAlertAt?.[alert.key];
      // "recovered" is a one-off transition: it must never be rate-limited away.
      if (
        alert.key !== 'recovered' &&
        lastSent &&
        now - new Date(lastSent).getTime() < windowMs
      ) {
        continue;
      }
      try {
        await this.notificationsService.notifyMonitoringAlert({
          projectName,
          connectionName: connection.name,
          connectionType: connection.type,
          severity: alert.severity,
          title: alert.title,
          detail: alert.detail,
          target:
            connection.url ?? connection.host ?? connection.serviceId ?? '',
          channels: {
            email: connection.alerts.email,
            whatsapp: connection.alerts.whatsapp,
          },
          extraEmails: connection.alerts.extraEmails,
          extraPhones: connection.alerts.extraPhones,
        });
        sent.push(alert.key);
      } catch (error) {
        this.logger.warn(
          `No se pudo enviar la alerta "${alert.key}" de ${connection.name}: ${(error as Error).message}`,
        );
      }
    }
    return sent;
  }
}
