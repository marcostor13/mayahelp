import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CreateProjectPayload, Project, ProjectShareLink } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly baseUrl = `${environment.apiUrl}/projects`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<Project[]>(this.baseUrl);
  }

  getById(id: string) {
    return this.http.get<Project>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateProjectPayload) {
    return this.http.post<Project>(this.baseUrl, payload);
  }

  update(id: string, payload: Partial<CreateProjectPayload>) {
    return this.http.patch<Project>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  listShareLinks(projectId: string) {
    return this.http.get<ProjectShareLink[]>(`${this.baseUrl}/${projectId}/share-links`);
  }

  createShareLink(projectId: string, label?: string, expiresAt?: string) {
    return this.http.post<ProjectShareLink>(`${this.baseUrl}/${projectId}/share-links`, {
      label: label || undefined,
      expiresAt: expiresAt || undefined,
    });
  }

  setShareLinkActive(id: string, isActive: boolean) {
    return this.http.patch<ProjectShareLink>(`${environment.apiUrl}/project-share-links/${id}`, {
      isActive,
    });
  }

  removeShareLink(id: string) {
    return this.http.delete<void>(`${environment.apiUrl}/project-share-links/${id}`);
  }
}
