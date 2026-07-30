import { Module } from '@nestjs/common';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    ProjectsModule,
    UsersModule,
    TicketsModule,
    AttachmentsModule,
    CategoriesModule,
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
