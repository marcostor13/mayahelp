import { Role } from './user.model';

export interface UserNotificationPreferences {
  email: boolean;
  whatsapp: boolean;
}

/** A user as the admin screen sees it, with the tickets they have opened. */
export interface ManagedUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  company?: string;
  phone?: string;
  /** May be absent on accounts created before per-user preferences existed. */
  notifications?: UserNotificationPreferences;
  isActive: boolean;
  isAiAgent?: boolean;
  ticketsCount?: number;
  createdAt: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  /** Optional: the API generates a temporary password and returns it once. */
  password?: string;
  role?: Role;
  company?: string;
  phone?: string;
  notifyByEmail?: boolean;
  notifyByWhatsApp?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: Role;
  company?: string;
  phone?: string;
  isActive?: boolean;
  notifyByEmail?: boolean;
  notifyByWhatsApp?: boolean;
}

export interface CreatedUserResponse {
  user: ManagedUser;
  temporaryPassword?: string;
}

/** Someone authorized on a public link who still has no account. */
export interface PendingReporter {
  name: string;
  email: string;
  projects: string[];
}

export interface CreatedAccount {
  id: string;
  name: string;
  email: string;
  temporaryPassword?: string;
}
