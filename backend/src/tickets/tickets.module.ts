import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ticket, TicketSchema } from './schemas/ticket.schema';
import {
  Attachment,
  AttachmentSchema,
} from '../attachments/schemas/attachment.schema';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { BulkImportService } from './bulk-import.service';
import { BulkImportController } from './bulk-import.controller';
import { TicketAutoReplyService } from './ticket-auto-reply.service';
import { CountersModule } from '../common/counters/counters.module';
import { UsersModule } from '../users/users.module';
import { CategoriesModule } from '../categories/categories.module';
import { ArticlesModule } from '../articles/articles.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    // The Attachment model (not AttachmentsModule) is registered here on purpose:
    // AttachmentsModule imports TicketsModule, so importing it back would be circular.
    // The ticket list only needs to *count* attachments.
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: Attachment.name, schema: AttachmentSchema },
    ]),
    CountersModule,
    UsersModule,
    CategoriesModule,
    ArticlesModule,
    AiModule,
    NotificationsModule,
  ],
  controllers: [TicketsController, BulkImportController],
  providers: [TicketsService, BulkImportService, TicketAutoReplyService],
  exports: [TicketsService],
})
export class TicketsModule {}
