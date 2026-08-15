import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BackupsService } from './backups.service';
import { BackupTrigger } from './schemas/database-backup.schema';

/**
 * Dispara los backups vencidos, mirando cada minuto. La hora que eligió el usuario ya se
 * tradujo a un instante UTC (`nextRunAt`) al guardar la conexión, así que acá no hay que
 * saber nada de zonas horarias: alcanza con comparar contra "ahora".
 *
 * Corren de a uno: un `mongodump` se come CPU, red y disco del contenedor, y dos en
 * paralelo sobre el mismo servidor es peor que esperar un minuto más.
 */
@Injectable()
export class BackupsScheduler {
  private readonly logger = new Logger(BackupsScheduler.name);
  private running = false;

  constructor(private readonly backupsService: BackupsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runDueBackups(): Promise<void> {
    // Un dump largo no debe solaparse con el tick siguiente.
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.backupsService.findDueConnections();
      for (const connection of due) {
        this.logger.log(`Backup programado de "${connection.name}"`);
        try {
          // `runBackup` no lanza por fallas del dump: las registra en el historial. Sí
          // lanza si hay uno manual en curso, y eso no debe saltear al resto de la tanda.
          await this.backupsService.runBackup(
            connection,
            BackupTrigger.SCHEDULED,
            null,
          );
        } catch (error) {
          this.logger.warn(
            `No se pudo iniciar el backup de "${connection.name}": ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Error en el ciclo de backups: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }
}
