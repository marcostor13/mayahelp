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
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    // Ticket and ProjectShareLink models (not their modules) are registered here: both
    // modules already depend on UsersModule, so importing them back would be circular.
    // The users screen only needs to count tickets and read the links' reporters.
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: ProjectShareLink.name, schema: ProjectShareLinkSchema },
    ]),
    // Para el correo con la contraseña temporal del reseteo. No es circular:
    // NotificationsModule no depende de UsersModule.
    NotificationsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
