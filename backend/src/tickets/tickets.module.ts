import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ticket, TicketSchema } from './schemas/ticket.schema';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { BulkImportService } from './bulk-import.service';
import { BulkImportController } from './bulk-import.controller';
import { CountersModule } from '../common/counters/counters.module';
import { UsersModule } from '../users/users.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ticket.name, schema: TicketSchema }]),
    CountersModule,
    UsersModule,
    CategoriesModule,
  ],
  controllers: [TicketsController, BulkImportController],
  providers: [TicketsService, BulkImportService],
  exports: [TicketsService],
})
export class TicketsModule {}
