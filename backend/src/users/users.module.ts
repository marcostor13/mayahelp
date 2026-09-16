import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { Ticket, TicketSchema } from '../tickets/schemas/ticket.schema';
import {
  ProjectShareLink,
  ProjectShareLinkSchema,
} from '../projects/schemas/project-share-link.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { SuperAdminBootstrap } from './super-admin.bootstrap';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectAccessModule } from '../common/project-access/project-access.module';

@Module({
  imports: [
    // Ticket and ProjectShareLink models (not their modules) are registered here: both
    // modules already depend on UsersModule, so importing them back would be circular.
    // The users screen only needs to count tickets, read the links' reporters and
    // validate the projects assigned to each account.
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: ProjectShareLink.name, schema: ProjectShareLinkSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
    // Para el correo con la contraseña temporal del reseteo. No es circular:
    // NotificationsModule no depende de UsersModule.
    NotificationsModule,
    ProjectAccessModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, SuperAdminBootstrap],
  exports: [UsersService],
})
export class UsersModule {}
