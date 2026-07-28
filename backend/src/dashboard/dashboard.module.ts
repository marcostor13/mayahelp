import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ticket, TicketSchema } from '../tickets/schemas/ticket.schema';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ticket.name, schema: TicketSchema }]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
