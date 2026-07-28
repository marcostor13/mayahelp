import { Category } from './category.model';

export type TicketStatus = 'abierto' | 'en_proceso' | 'resuelto' | 'cerrado';
export type TicketPriority = 'baja' | 'media' | 'alta';
export type TicketSource =
  | 'portal'
  | 'public_link'
  | 'bulk_import'
  | 'whatsapp'
  | 'email'
  | 'api';

export type TicketEventType =
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'category_changed'
  | 'assigned'
  | 'unassigned'
  | 'commented'
  | 'ai_replied';

export interface TicketEvent {
  _id: string;
  actorName: string;
  type: TicketEventType;
  from: string | null;
  to: string | null;
  createdAt: string;
}

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
  source: TicketSource;
  comments: TicketComment[];
  satisfaction: number | null;
  createdAt: string;
  updatedAt: string;
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
  client?: string;
  search?: string;
  page?: number;
  limit?: number;
}
