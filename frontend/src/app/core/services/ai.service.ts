import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AiTicketDraft } from '../models/ai-draft.model';

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly baseUrl = `${environment.apiUrl}/tickets/ai-draft`;

  constructor(private readonly http: HttpClient) {}

  draftTicket(freeText: string, imageBase64?: string) {
    return this.http.post<AiTicketDraft>(this.baseUrl, { freeText, imageBase64 });
  }
}
