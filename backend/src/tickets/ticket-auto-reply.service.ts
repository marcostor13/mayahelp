import { Injectable, Logger } from '@nestjs/common';
import { TicketDocument } from './schemas/ticket.schema';
import { AiService } from '../ai/ai.service';
import { UsersService } from '../users/users.service';
import { CategoriesService } from '../categories/categories.service';
import { ArticlesService } from '../articles/articles.service';

const MAX_REFERENCE_ARTICLES = 3;

@Injectable()
export class TicketAutoReplyService {
  private readonly logger = new Logger(TicketAutoReplyService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly usersService: UsersService,
    private readonly categoriesService: CategoriesService,
    private readonly articlesService: ArticlesService,
  ) {}

  /** Best-effort: never throws, so a failure here never breaks ticket creation/commenting. */
  async maybeReply(ticket: TicketDocument): Promise<void> {
    try {
      const category = await this.categoriesService.findById(
        ticket.category.toString(),
      );
      if (category.autoReplyMode === 'off') {
        return;
      }

      const articles = await this.articlesService.findAll({
        search: ticket.subject,
      });
      const referenceArticles = articles
        .slice(0, MAX_REFERENCE_ARTICLES)
        .map((a) => ({ title: a.title, content: a.content }));

      const reply = await this.aiService.suggestReply(
        {
          subject: ticket.subject,
          description: ticket.description,
          comments: ticket.comments.map((c) => ({
            authorName: c.authorName,
            message: c.message,
          })),
        },
        referenceArticles,
      );
      if (!reply) {
        return;
      }

      const aiAgent = await this.usersService.findOrCreateAiAgent();
      ticket.comments.push({
        author: aiAgent._id,
        authorName: aiAgent.name,
        message: reply,
        isInternal: category.autoReplyMode === 'draft',
        createdAt: new Date(),
      });
      await ticket.save();
    } catch (error) {
      this.logger.warn(
        `No se pudo generar respuesta automática para el ticket ${ticket.code}: ${(error as Error).message}`,
      );
    }
  }
}
