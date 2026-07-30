import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  ImplementationRun,
  ProjectRepo,
  SaveRepoPayload,
  TriggerRunPayload,
} from '../models/implementation.model';

@Injectable({ providedIn: 'root' })
export class ImplementationService {
  private readonly baseUrl = `${environment.apiUrl}/implementations`;

  constructor(private readonly http: HttpClient) {}

  getRepo(projectId: string) {
    return this.http.get<ProjectRepo | null>(`${this.baseUrl}/projects/${projectId}/repo`);
  }

  saveRepo(projectId: string, payload: SaveRepoPayload) {
    return this.http.put<ProjectRepo>(`${this.baseUrl}/projects/${projectId}/repo`, payload);
  }

  removeRepo(projectId: string) {
    return this.http.delete<void>(`${this.baseUrl}/projects/${projectId}/repo`);
  }

  list(projectId?: string) {
    return this.http.get<ImplementationRun[]>(this.baseUrl, {
      params: projectId ? { project: projectId } : {},
    });
  }

  findOne(id: string) {
    return this.http.get<ImplementationRun>(`${this.baseUrl}/${id}`);
  }

  trigger(payload: TriggerRunPayload) {
    return this.http.post<ImplementationRun>(this.baseUrl, payload);
  }

  /** Refreshes against GitHub instead of waiting for the scheduler. */
  sync(id: string) {
    return this.http.post<ImplementationRun>(`${this.baseUrl}/${id}/sync`, {});
  }

  cancel(id: string) {
    return this.http.post<ImplementationRun>(`${this.baseUrl}/${id}/cancel`, {});
  }
}
