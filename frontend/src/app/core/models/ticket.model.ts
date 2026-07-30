import { Category } from './category.model';

export type TicketStatus = 'abierto' | 'en_proceso' | 'resuelto' | 'cerrado';
export type TicketPriority = 'baja' | 'media' | 'alta';

export type TicketSortField =
  'code' | 'subject' | 'status' | 'priority' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface TicketComment {
  author: string;
  authorName: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketParticipant {
  _id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
}

export interface TicketProjectRef {
  _id: string;
  name: string;
}

export interface Ticket {
  _id: string;
  code: string;
  subject: string;
  description: string;
  client: TicketParticipant;
  category: Category;
  project: TicketProjectRef | null;
  assignedAgent: TicketParticipant | null;
  status: TicketStatus;
  priority: TicketPriority;
  comments: TicketComment[];
  satisfaction: number | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present in list responses so the table can show activity without extra requests. */
  commentsCount?: number;
  attachmentsCount?: number;
}

export interface CreateTicketPayload {
  subject: string;
  description: string;
  category: string;
  priority?: TicketPriority;
}

export interface TicketFilter {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: string;
  project?: string;
  search?: string;
  sort?: TicketSortField;
  order?: SortOrder;
}
