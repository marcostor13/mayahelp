import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { Ticket, TicketSchema } from '../tickets/schemas/ticket.schema';
import { Article, ArticleSchema } from '../articles/schemas/article.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';

/**
 * Reads across four collections with a lean projection instead of going through the
 * feature services: the palette needs a handful of labels, not fully populated
 * documents, and one aggregated query beats four service round-trips per keystroke.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: Article.name, schema: ArticleSchema },
      { name: User.name, schema: UserSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
