import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { BulkImportResult } from '../models/bulk-import.model';

@Injectable({ providedIn: 'root' })
export class BulkImportService {
  private readonly baseUrl = `${environment.apiUrl}/tickets/bulk-import`;

  constructor(private readonly http: HttpClient) {}

  import(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<BulkImportResult>(this.baseUrl, formData);
  }

  downloadTemplate() {
    return this.http.get(`${this.baseUrl}/template`, { responseType: 'blob' });
  }
}
