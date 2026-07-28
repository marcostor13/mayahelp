import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ticket, TicketSchema } from './schemas/ticket.schema';
import { TicketEvent, TicketEventSchema } from './schemas/ticket-event.schema';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { BulkImportService } from './bulk-import.service';
import { BulkImportController } from './bulk-import.controller';
import { TicketAutoReplyService } from './ticket-auto-reply.service';
import { TicketEventsService } from './ticket-events.service';
import { CountersModule } from '../common/counters/counters.module';
import { UsersModule } from '../users/users.module';
import { CategoriesModule } from '../categories/categories.module';
import { ArticlesModule } from '../articles/articles.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: TicketEvent.name, schema: TicketEventSchema },
    ]),
    CountersModule,
    UsersModule,
    CategoriesModule,
    ArticlesModule,
    AiModule,
    NotificationsModule,
  ],
  controllers: [TicketsController, BulkImportController],
  providers: [
    TicketsService,
    BulkImportService,
    TicketAutoReplyService,
    TicketEventsService,
  ],
  exports: [TicketsService],
})
export class TicketsModule {}
