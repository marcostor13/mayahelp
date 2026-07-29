import { Module } from '@nestjs/common';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { RelevanceModule } from '../relevance/relevance.module';

@Module({
  imports: [
    ProjectsModule,
    UsersModule,
    TicketsModule,
    AttachmentsModule,
    RelevanceModule,
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
