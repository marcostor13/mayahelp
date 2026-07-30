import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateConnectionPayload,
  MonitoringOverviewRow,
  ProjectConnection,
  ProjectMonitoringDashboard,
  RunCheckResult,
} from '../models/monitoring.model';

@Injectable({ providedIn: 'root' })
export class MonitoringService {
  private readonly baseUrl = `${environment.apiUrl}/monitoring`;

  constructor(private readonly http: HttpClient) {}

  overview() {
    return this.http.get<MonitoringOverviewRow[]>(`${this.baseUrl}/overview`);
  }

  projectDashboard(projectId: string, hours = 24) {
    return this.http.get<ProjectMonitoringDashboard>(`${this.baseUrl}/projects/${projectId}`, {
      params: { hours: String(hours) },
    });
  }

  create(payload: CreateConnectionPayload) {
    return this.http.post<ProjectConnection>(`${this.baseUrl}/connections`, payload);
  }

  update(id: string, payload: Partial<CreateConnectionPayload>) {
    return this.http.patch<ProjectConnection>(`${this.baseUrl}/connections/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/connections/${id}`);
  }

  /** Runs the probe right now instead of waiting for the scheduler. */
  check(id: string) {
    return this.http.post<RunCheckResult>(`${this.baseUrl}/connections/${id}/check`, {});
  }
}
