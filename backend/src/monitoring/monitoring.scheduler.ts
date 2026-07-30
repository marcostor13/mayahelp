import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MonitoringService } from './monitoring.service';

/**
 * Runs the checks that are due, every minute. Each connection has its own interval;
 * this loop only picks the ones whose interval already elapsed, and caps how many run
 * at once so a long SSH probe cannot stall the rest.
 */
@Injectable()
export class MonitoringScheduler {
  private readonly logger = new Logger(MonitoringScheduler.name);
  private running = false;

  constructor(private readonly monitoringService: MonitoringService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runDueChecks(): Promise<void> {
    // A slow round must not overlap with the next tick.
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.monitoringService.findDueConnections(25);
      if (due.length === 0) return;

      const results = await Promise.allSettled(
        due.map((connection) => this.monitoringService.runCheck(connection)),
      );
      const failures = results.filter((r) => r.status === 'rejected').length;
      this.logger.log(
        `Monitoreo: ${due.length} chequeo(s)${failures ? `, ${failures} con error interno` : ''}`,
      );
    } catch (error) {
      this.logger.warn(
        `Error en el ciclo de monitoreo: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }
}
