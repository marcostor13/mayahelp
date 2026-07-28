import { Injectable, Logger } from '@nestjs/common';
import { TicketDocument } from './schemas/ticket.schema';
import { AiService } from '../ai/ai.service';
import { UsersService } from '../users/users.service';
import { CategoriesService } from '../categories/categories.service';
import { ArticlesService } from '../articles/articles.service';
import { NotificationsService } from '../notifications/notifications.service';

const MAX_REFERENCE_ARTICLES = 3;

@Injectable()
export class TicketAutoReplyService {
  private readonly logger = new Logger(TicketAutoReplyService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly usersService: UsersService,
    private readonly categoriesService: CategoriesService,
    private readonly articlesService: ArticlesService,
    private readonly notificationsService: NotificationsService,
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
      const isInternal = category.autoReplyMode === 'draft';
      ticket.comments.push({
        author: aiAgent._id,
        authorName: aiAgent.name,
        message: reply,
        isInternal,
        createdAt: new Date(),
      });
      await ticket.save();

      if (!isInternal) {
        const client = await this.usersService.findById(
          ticket.client.toString(),
        );
        await this.notificationsService.notifyNewComment(
          { name: client.name, email: client.email, phone: client.phone },
          { _id: ticket.id, code: ticket.code, subject: ticket.subject },
          aiAgent.name,
          reply,
        );
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo generar respuesta automática para el ticket ${ticket.code}: ${(error as Error).message}`,
      );
    }
  }
}
