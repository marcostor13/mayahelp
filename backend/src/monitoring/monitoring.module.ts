import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import {
  ProjectConnection,
  ProjectConnectionSchema,
} from './schemas/project-connection.schema';
import {
  MonitorCheck,
  MonitorCheckSchema,
} from './schemas/monitor-check.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringScheduler } from './monitoring.scheduler';
import { MonitoringAlertsService } from './monitoring-alerts.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: ProjectConnection.name, schema: ProjectConnectionSchema },
      { name: MonitorCheck.name, schema: MonitorCheckSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringScheduler, MonitoringAlertsService],
})
export class MonitoringModule {}
