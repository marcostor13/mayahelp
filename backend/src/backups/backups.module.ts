import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import {
  DatabaseConnection,
  DatabaseConnectionSchema,
} from './schemas/database-connection.schema';
import {
  DatabaseBackup,
  DatabaseBackupSchema,
} from './schemas/database-backup.schema';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';
import { BackupsScheduler } from './backups.scheduler';
import { BackupStorageService } from './backup-storage.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: DatabaseConnection.name, schema: DatabaseConnectionSchema },
      { name: DatabaseBackup.name, schema: DatabaseBackupSchema },
    ]),
  ],
  controllers: [BackupsController],
  providers: [BackupsService, BackupsScheduler, BackupStorageService],
})
export class BackupsModule {}
