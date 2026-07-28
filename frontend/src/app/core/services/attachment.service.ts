import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Attachment } from '../models/attachment.model';

@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  listForTicket(ticketId: string) {
    return this.http.get<Attachment[]>(`${this.baseUrl}/tickets/${ticketId}/attachments`);
  }

  upload(ticketId: string, file: File, commentId?: string) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<Attachment>(
      `${this.baseUrl}/tickets/${ticketId}/attachments`,
      formData,
      commentId ? { params: { commentId } } : {},
    );
  }

  remove(attachmentId: string) {
    return this.http.delete<void>(`${this.baseUrl}/attachments/${attachmentId}`);
  }
}
