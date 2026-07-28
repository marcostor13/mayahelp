import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AgentTask } from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly baseUrl = `${environment.apiUrl}/tasks`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<AgentTask[]>(this.baseUrl);
  }

  create(title: string, dueAt?: string) {
    return this.http.post<AgentTask>(this.baseUrl, { title, dueAt });
  }

  setDone(id: string, done: boolean) {
    return this.http.patch<AgentTask>(`${this.baseUrl}/${id}`, { done });
  }
}
