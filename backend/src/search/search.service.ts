import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { Ticket, TicketDocument } from '../tickets/schemas/ticket.schema';
import { Article, ArticleDocument } from '../articles/schemas/article.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import {
  buildTicketQuery,
  buildTicketSearchFallback,
  usesTextSearch,
} from '../tickets/ticket-query';
import { escapeRegex } from '../common/search/escape-regex';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';
import { FilterTicketDto } from '../tickets/dto/filter-ticket.dto';

/** Per section. The palette shows a handful of each, not an exhaustive listing. */
const RESULTS_PER_TYPE = 5;

export interface SearchResults {
  tickets: { _id: string; code: string; subject: string; status: string }[];
  articles: { _id: string; title: string }[];
  clients: { _id: string; name: string; email: string; company?: string }[];
  projects: { _id: string; name: string; status: string }[];
}

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
  ) {}

  async search(
    rawTerm: string,
    requester: AuthenticatedUser,
  ): Promise<SearchResults> {
    const term = rawTerm.trim();
    // Clients have no business browsing the customer list or the project roster;
    // their own tickets are already scoped by buildTicketQuery.
    const isStaff = requester.role !== Role.CLIENT;

    const [tickets, articles, clients, projects] = await Promise.all([
      this.searchTickets(term, requester),
      this.searchArticles(term),
      isStaff ? this.searchClients(term) : Promise.resolve([]),
      isStaff ? this.searchProjects(term) : Promise.resolve([]),
    ]);

    return { tickets, articles, clients, projects };
  }

  private async searchTickets(
    term: string,
    requester: AuthenticatedUser,
  ): Promise<SearchResults['tickets']> {
    const filter = { search: term } as FilterTicketDto;
    const run = (query: QueryFilter<TicketDocument>) =>
      this.ticketModel
        .find(query, 'code subject status')
        .sort({ createdAt: -1 })
        .limit(RESULTS_PER_TYPE)
        .lean()
        .exec();

    let found = await run(buildTicketQuery(filter, requester));
    // Same reason as the ticket list: $text misses the prefixes people actually type.
    if (found.length === 0 && usesTextSearch(filter)) {
      found = await run(buildTicketSearchFallback(filter, requester));
    }

    return found.map((ticket) => ({
      _id: String(ticket._id),
      code: ticket.code,
      subject: ticket.subject,
      status: ticket.status,
    }));
  }

  private async searchArticles(
    term: string,
  ): Promise<SearchResults['articles']> {
    let found = await this.articleModel
      .find({ $text: { $search: term } }, 'title')
      .limit(RESULTS_PER_TYPE)
      .lean()
      .exec();

    if (found.length === 0) {
      found = await this.articleModel
        .find({ title: { $regex: escapeRegex(term), $options: 'i' } }, 'title')
        .limit(RESULTS_PER_TYPE)
        .lean()
        .exec();
    }

    return found.map((article) => ({
      _id: String(article._id),
      title: article.title,
    }));
  }

  private async searchClients(term: string): Promise<SearchResults['clients']> {
    const pattern = escapeRegex(term);
    const found = await this.userModel
      .find(
        {
          isActive: true,
          isAiAgent: false,
          $or: [
            { name: { $regex: pattern, $options: 'i' } },
            { email: { $regex: pattern, $options: 'i' } },
            { company: { $regex: pattern, $options: 'i' } },
          ],
        },
        'name email company',
      )
      .limit(RESULTS_PER_TYPE)
      .lean()
      .exec();

    return found.map((user) => ({
      _id: String(user._id),
      name: user.name,
      email: user.email,
      company: user.company,
    }));
  }

  private async searchProjects(
    term: string,
  ): Promise<SearchResults['projects']> {
    const found = await this.projectModel
      .find(
        { name: { $regex: escapeRegex(term), $options: 'i' } },
        'name status',
      )
      .limit(RESULTS_PER_TYPE)
      .lean()
      .exec();

    return found.map((project) => ({
      _id: String(project._id),
      name: project.name,
      status: project.status,
    }));
  }
}
