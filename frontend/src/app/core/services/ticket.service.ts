import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CreateTicketPayload, Ticket, TicketFilter } from '../models/ticket.model';

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
    return this.http.get<Ticket[]>(this.baseUrl, { params });
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
