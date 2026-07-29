import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RelevanceService } from './relevance.service';
import { Ticket, TicketSchema } from '../tickets/schemas/ticket.schema';
import { Article, ArticleSchema } from '../articles/schemas/article.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: Article.name, schema: ArticleSchema },
    ]),
  ],
  providers: [RelevanceService],
  exports: [RelevanceService],
})
export class RelevanceModule {}
