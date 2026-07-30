import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TicketFilter } from '../models/ticket.model';

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

  /**
   * One Markdown file with every requested ticket, ready to hand to a coding AI.
   * Pass `ids` for a selection, or a `filter` (even an empty one) to export all of them.
   */
  exportCombinedMarkdown(params: { ids?: string[]; filter?: TicketFilter }) {
    return this.http.post(
      `${this.baseUrl}/tickets/export/combined.md`,
      { ids: params.ids?.length ? params.ids : undefined, filter: params.filter ?? {} },
      { responseType: 'blob' },
    );
  }

  exportTicketsBulk(ticketIds: string[]) {
    return this.http
      .post(`${this.baseUrl}/tickets/export/bulk.md`, { ids: ticketIds }, { responseType: 'blob' })
      .subscribe((blob) => triggerDownload(blob, 'tickets-export.zip'));
  }
}
