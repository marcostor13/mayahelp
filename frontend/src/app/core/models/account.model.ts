import { Category } from './category.model';
import { ProjectStatus } from './project.model';
import { Ticket, TicketPriority, TicketStatus } from './ticket.model';

export interface AccountProject {
  _id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  defaultCategory: Category | null;
  ticketsCount: number;
  openTicketsCount: number;
  createdAt: string;
}

export interface AccountSummary {
  tickets: {
    total: number;
    open: number;
    resolved: number;
    byStatus: Partial<Record<TicketStatus, number>>;
    byPriority: Partial<Record<TicketPriority, number>>;
  };
  projects: AccountProject[];
  recentTickets: Ticket[];
}
