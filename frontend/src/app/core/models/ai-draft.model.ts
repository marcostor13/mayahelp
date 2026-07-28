import { TicketPriority } from './ticket.model';

export interface AiTicketDraft {
  subject: string;
  description: string;
  categoryId: string | null;
  priority: TicketPriority;
}
