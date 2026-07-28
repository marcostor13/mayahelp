import { Category } from './category.model';

export type TicketStatus = 'abierto' | 'en_proceso' | 'resuelto' | 'cerrado';
export type TicketPriority = 'baja' | 'media' | 'alta';

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

export interface Ticket {
  _id: string;
  code: string;
  subject: string;
  description: string;
  client: TicketParticipant;
  category: Category;
  assignedAgent: TicketParticipant | null;
  status: TicketStatus;
  priority: TicketPriority;
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
  search?: string;
}
