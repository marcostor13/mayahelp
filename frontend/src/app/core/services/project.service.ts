import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateProjectPayload,
  Project,
  ProjectReporter,
  ProjectShareLink,
} from '../models/project.model';

export interface ReporterInput {
  name: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly baseUrl = `${environment.apiUrl}/projects`;
  private readonly shareLinksUrl = `${environment.apiUrl}/project-share-links`;

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

  createShareLink(
    projectId: string,
    label?: string,
    expiresAt?: string,
    reporters?: ReporterInput[],
  ) {
    return this.http.post<ProjectShareLink>(`${this.baseUrl}/${projectId}/share-links`, {
      label: label || undefined,
      expiresAt: expiresAt || undefined,
      reporters: reporters?.length ? reporters : undefined,
    });
  }

  setShareLinkActive(id: string, isActive: boolean) {
    return this.http.patch<ProjectShareLink>(`${this.shareLinksUrl}/${id}`, { isActive });
  }

  removeShareLink(id: string) {
    return this.http.delete<void>(`${this.shareLinksUrl}/${id}`);
  }

  addReporter(linkId: string, reporter: ReporterInput) {
    return this.http.post<ProjectShareLink>(`${this.shareLinksUrl}/${linkId}/reporters`, reporter);
  }

  removeReporter(linkId: string, reporterId: ProjectReporter['_id']) {
    return this.http.delete<ProjectShareLink>(
      `${this.shareLinksUrl}/${linkId}/reporters/${reporterId}`,
    );
  }
}
