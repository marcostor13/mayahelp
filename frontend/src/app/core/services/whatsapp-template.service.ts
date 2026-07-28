import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CreateWhatsAppTemplatePayload, WhatsAppTemplate } from '../models/whatsapp-template.model';

@Injectable({ providedIn: 'root' })
export class WhatsAppTemplateService {
  private readonly baseUrl = `${environment.apiUrl}/whatsapp-templates`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<WhatsAppTemplate[]>(this.baseUrl);
  }

  create(payload: CreateWhatsAppTemplatePayload) {
    return this.http.post<WhatsAppTemplate>(this.baseUrl, payload);
  }
}
