import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ProjectRepo, ProjectRepoSchema } from './schemas/project-repo.schema';
import {
  ImplementationRun,
  ImplementationRunSchema,
} from './schemas/implementation-run.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Ticket, TicketSchema } from '../tickets/schemas/ticket.schema';
import { ImplementationsService } from './implementations.service';
import { ImplementationsController } from './implementations.controller';
import { ImplementationHooksController } from './implementation-hooks.controller';
import { ImplementationsScheduler } from './implementations.scheduler';
import { GithubService } from './github.service';
import { ExportModule } from '../export/export.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: ProjectRepo.name, schema: ProjectRepoSchema },
      { name: ImplementationRun.name, schema: ImplementationRunSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Ticket.name, schema: TicketSchema },
    ]),
    ExportModule,
  ],
  controllers: [ImplementationsController, ImplementationHooksController],
  providers: [ImplementationsService, ImplementationsScheduler, GithubService],
})
export class ImplementationsModule {}
