import { Category } from './category.model';
import { TicketParticipant } from './ticket.model';

export type ProjectStatus = 'planning' | 'in_progress' | 'on_hold' | 'completed';

export interface Project {
  _id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  client: TicketParticipant | null;
  defaultCategory: Category | null;
  createdBy: string;
  createdAt: string;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  status?: ProjectStatus;
  client?: string;
  defaultCategory?: string;
}

export interface ProjectReporter {
  _id: string;
  name: string;
  email: string;
}

export interface ProjectShareLink {
  _id: string;
  project: string;
  token: string;
  label?: string;
  isActive: boolean;
  expiresAt: string | null;
  usageCount: number;
  createdAt: string;
  reporters: ProjectReporter[];
}
