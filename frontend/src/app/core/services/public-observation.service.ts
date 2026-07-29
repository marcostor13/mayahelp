import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreatePublicObservationPayload,
  PossibleDuplicate,
  PublicObservationResult,
  PublicProjectInfo,
} from '../models/public-observation.model';

@Injectable({ providedIn: 'root' })
export class PublicObservationService {
  private readonly baseUrl = `${environment.apiUrl}/public/observations`;

  constructor(private readonly http: HttpClient) {}

  getProjectInfo(token: string) {
    return this.http.get<PublicProjectInfo>(`${this.baseUrl}/${token}`);
  }

  checkDuplicates(token: string, subject: string, description: string) {
    return this.http.post<PossibleDuplicate[]>(
      `${this.baseUrl}/${token}/check-duplicates`,
      { subject, description },
    );
  }

  submit(token: string, payload: CreatePublicObservationPayload, files: File[]) {
    const formData = new FormData();
    formData.append('reporterName', payload.reporterName);
    formData.append('reporterEmail', payload.reporterEmail);
    formData.append('subject', payload.subject);
    formData.append('description', payload.description);
    files.forEach((file) => formData.append('files', file));
    return this.http.post<PublicObservationResult>(`${this.baseUrl}/${token}`, formData);
  }
}
