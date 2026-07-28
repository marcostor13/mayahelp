import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  exportTicket(ticketId: string, code: string) {
    return this.http
      .get(`${this.baseUrl}/tickets/${ticketId}/export.md`, { responseType: 'blob' })
      .subscribe((blob) => triggerDownload(blob, `${code}.md`));
  }

  exportTicketsBulk(ticketIds: string[]) {
    return this.http
      .post(`${this.baseUrl}/tickets/export/bulk.md`, { ids: ticketIds }, { responseType: 'blob' })
      .subscribe((blob) => triggerDownload(blob, 'tickets-export.zip'));
  }
}
