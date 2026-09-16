import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ticket, TicketSchema } from '../tickets/schemas/ticket.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { ProjectAccessModule } from '../common/project-access/project-access.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
    ProjectAccessModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
