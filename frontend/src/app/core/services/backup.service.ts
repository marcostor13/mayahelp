import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateDatabaseConnectionPayload,
  DatabaseBackup,
  DatabaseConnection,
  TestConnectionResult,
} from '../models/backup.model';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly baseUrl = `${environment.apiUrl}/backups`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<DatabaseConnection[]>(`${this.baseUrl}/connections`);
  }

  create(payload: CreateDatabaseConnectionPayload) {
    return this.http.post<DatabaseConnection>(`${this.baseUrl}/connections`, payload);
  }

  update(id: string, payload: Partial<CreateDatabaseConnectionPayload>) {
    return this.http.patch<DatabaseConnection>(`${this.baseUrl}/connections/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/connections/${id}`);
  }

  /** Abre la conexión real (túnel SSH incluido) sin volcar nada. */
  test(id: string) {
    return this.http.post<TestConnectionResult>(`${this.baseUrl}/connections/${id}/test`, {});
  }

  /** Dispara un backup ahora. La respuesta llega recién cuando el dump terminó. */
  run(id: string) {
    return this.http.post<DatabaseBackup>(`${this.baseUrl}/connections/${id}/run`, {});
  }

  history(id: string) {
    return this.http.get<DatabaseBackup[]>(`${this.baseUrl}/connections/${id}/history`);
  }

  /** Link firmado de R2 con el que se baja el `.archive.gz`. */
  downloadUrl(backupId: string) {
    return this.http.get<{ url: string }>(`${this.baseUrl}/${backupId}/download`);
  }
}
