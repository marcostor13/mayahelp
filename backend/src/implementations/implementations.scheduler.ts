import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ImplementationsService } from './implementations.service';

@Injectable()
export class ImplementationsScheduler {
  private readonly logger = new Logger(ImplementationsScheduler.name);
  /** Guards against a slow round overlapping the next tick. */
  private running = false;

  constructor(private readonly implementations: ImplementationsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async syncOpenRuns(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const runs = await this.implementations.findOpenRuns();
      for (const run of runs) {
        await this.implementations
          .sync(run)
          .catch((error: Error) =>
            this.logger.warn(`Corrida ${run.runKey}: ${error.message}`),
          );
      }
    } finally {
      this.running = false;
    }
  }
}
