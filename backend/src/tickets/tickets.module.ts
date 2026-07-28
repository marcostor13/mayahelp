import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ticket, TicketSchema } from './schemas/ticket.schema';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { CountersModule } from '../common/counters/counters.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ticket.name, schema: TicketSchema }]),
    CountersModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
