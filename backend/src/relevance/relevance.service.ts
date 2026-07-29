import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { Ticket, TicketDocument } from '../tickets/schemas/ticket.schema';
import { Article, ArticleDocument } from '../articles/schemas/article.schema';
import { TicketStatus } from '../common/enums/ticket.enum';
import { buildTextSearch } from './search-terms';

/**
 * Floor on Mongo's textScore before a hit is offered as "related" or "possibly a
 * duplicate". Unbounded and corpus-dependent, so it is a heuristic, not a
 * similarity measure: it exists to drop single-word coincidences, and every
 * consumer presents the result as a suggestion for a human to judge.
 */
const MIN_TEXT_SCORE = 1.2;

export interface RelevantArticle {
  _id: string;
  title: string;
  content: string;
  score: number;
}

export interface SimilarTicket {
  _id: string;
  code: string;
  subject: string;
  status: string;
  createdAt: Date;
  score: number;
}

/**
 * Lexical relevance over the text indexes added in Fase 0.
 *
 * This is the seam the semantic layer (F2) plugs into: when the cluster supports
 * `$vectorSearch`, these two methods gain an embedding-backed path and keep this
 * implementation as the fallback. Callers do not change.
 */
@Injectable()
export class RelevanceService {
  constructor(
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
  ) {}

  /**
   * Replaces the previous behaviour of regex-matching the whole subject against the
   * article body, which only hit when an article repeated the sentence verbatim —
   * so in practice the AI answered with no knowledge-base context at all.
   */
  async findRelevantArticles(
    text: string,
    limit = 3,
  ): Promise<RelevantArticle[]> {
    const search = buildTextSearch(text);
    if (!search) return [];

    const found = await this.articleModel
      .find(
        { $text: { $search: search } },
        { title: 1, content: 1, score: { $meta: 'textScore' } },
      )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean()
      .exec();

    return found
      .map((article) => ({
        _id: String(article._id),
        title: article.title,
        content: article.content,
        score: (article as { score?: number }).score ?? 0,
      }))
      .filter((article) => article.score >= MIN_TEXT_SCORE);
  }

  async findSimilarTickets(params: {
    text: string;
    excludeTicketId?: string;
    projectId?: string;
    clientId?: string;
    onlyUnresolved?: boolean;
    limit?: number;
  }): Promise<SimilarTicket[]> {
    const search = buildTextSearch(params.text);
    if (!search) return [];

    const query: QueryFilter<TicketDocument> = { $text: { $search: search } };
    if (params.excludeTicketId) {
      query._id = { $ne: new Types.ObjectId(params.excludeTicketId) };
    }
    if (params.projectId) {
      query.project = new Types.ObjectId(params.projectId);
    }
    if (params.clientId) {
      query.client = new Types.ObjectId(params.clientId);
    }
    if (params.onlyUnresolved) {
      // A closed ticket is not a duplicate worth merging into — it is history.
      query.status = { $in: [TicketStatus.ABIERTO, TicketStatus.EN_PROCESO] };
    }

    const found = await this.ticketModel
      .find(query, {
        code: 1,
        subject: 1,
        status: 1,
        createdAt: 1,
        score: { $meta: 'textScore' },
      })
      .sort({ score: { $meta: 'textScore' } })
      .limit(params.limit ?? 3)
      .lean()
      .exec();

    return found
      .map((ticket) => ({
        _id: String(ticket._id),
        code: ticket.code,
        subject: ticket.subject,
        status: ticket.status,
        createdAt: ticket.createdAt,
        score: (ticket as { score?: number }).score ?? 0,
      }))
      .filter((ticket) => ticket.score >= MIN_TEXT_SCORE);
  }
}
