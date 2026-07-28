import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateTicketPayload,
  Ticket,
  TicketEvent,
  TicketFilter,
} from '../models/ticket.model';
import { Paginated } from '../models/pagination.model';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly baseUrl = `${environment.apiUrl}/tickets`;

  constructor(private readonly http: HttpClient) {}

  list(filter: TicketFilter = {}) {
    const params: Record<string, string> = {};
    if (filter.status) params['status'] = filter.status;
    if (filter.priority) params['priority'] = filter.priority;
    if (filter.category) params['category'] = filter.category;
    if (filter.search) params['search'] = filter.search;
    if (filter.page) params['page'] = String(filter.page);
    if (filter.limit) params['limit'] = String(filter.limit);
    return this.http.get<Paginated<Ticket>>(this.baseUrl, { params });
  }

  events(id: string) {
    return this.http.get<TicketEvent[]>(`${this.baseUrl}/${id}/events`);
  }

  getById(id: string) {
    return this.http.get<Ticket>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateTicketPayload) {
    return this.http.post<Ticket>(this.baseUrl, payload);
  }

  updateStatus(id: string, status: string) {
    return this.http.patch<Ticket>(`${this.baseUrl}/${id}`, { status });
  }

  updatePriority(id: string, priority: string) {
    return this.http.patch<Ticket>(`${this.baseUrl}/${id}`, { priority });
  }

  addComment(id: string, message: string) {
    return this.http.post<Ticket>(`${this.baseUrl}/${id}/comments`, { message });
  }
}
