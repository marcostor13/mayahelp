import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateUserPayload,
  CreatedAccount,
  CreatedUserResponse,
  ManagedUser,
  PendingReporter,
  ResetPasswordResponse,
  UpdateUserPayload,
} from '../models/managed-user.model';
import { Role } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly baseUrl = `${environment.apiUrl}/users`;

  constructor(private readonly http: HttpClient) {}

  list(filter: { role?: Role; search?: string } = {}) {
    const params: Record<string, string> = {};
    if (filter.role) params['role'] = filter.role;
    if (filter.search) params['search'] = filter.search;
    return this.http.get<ManagedUser[]>(this.baseUrl, { params });
  }

  create(payload: CreateUserPayload) {
    return this.http.post<CreatedUserResponse>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateUserPayload) {
    return this.http.patch<ManagedUser>(`${this.baseUrl}/${id}`, payload);
  }

  /** Reemplaza la lista completa de proyectos que ve esa cuenta. */
  setProjects(id: string, projects: string[]) {
    return this.http.put<ManagedUser>(`${this.baseUrl}/${id}/projects`, { projects });
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /** Genera una contraseña temporal, la manda por correo y cierra las sesiones abiertas. */
  resetPassword(id: string) {
    return this.http.post<ResetPasswordResponse>(`${this.baseUrl}/${id}/reset-password`, {});
  }

  /** People pre-authorized on the public links that do not have an account yet. */
  pendingReporters() {
    return this.http.get<PendingReporter[]>(`${this.baseUrl}/pending-reporters`);
  }

  createFromReporters(emails: string[]) {
    return this.http.post<CreatedAccount[]>(`${this.baseUrl}/from-reporters`, { emails });
  }
}
