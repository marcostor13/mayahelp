import { Ticket } from './ticket.model';

export interface WeeklyActivityPoint {
  label: string;
  count: number;
}

export interface DashboardStats {
  openTickets: number;
  avgResponseMinutes: number | null;
  csat: number | null;
  weeklyActivity: WeeklyActivityPoint[];
  recentTickets: Ticket[];
}
