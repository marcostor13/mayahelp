import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CreateTicketPayload, Ticket, TicketFilter } from '../models/ticket.model';

/** Serializes a ticket filter into query params, dropping empty values. */
export function ticketFilterParams(filter: TicketFilter): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(filter)) {
    if (value) params[key] = String(value);
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly baseUrl = `${environment.apiUrl}/tickets`;

  constructor(private readonly http: HttpClient) {}

  list(filter: TicketFilter = {}) {
    return this.http.get<Ticket[]>(this.baseUrl, { params: ticketFilterParams(filter) });
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

  /** Cambio de estado en lote; devuelve los tickets que efectivamente cambiaron. */
  updateStatusMany(ids: string[], status: string) {
    return this.http.patch<Ticket[]>(`${this.baseUrl}/status`, { ids, status });
  }

  updatePriority(id: string, priority: string) {
    return this.http.patch<Ticket>(`${this.baseUrl}/${id}`, { priority });
  }

  addComment(id: string, message: string) {
    return this.http.post<Ticket>(`${this.baseUrl}/${id}/comments`, { message });
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
