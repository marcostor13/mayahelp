import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Category, CategoryType, CreateCategoryPayload } from '../models/category.model';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly baseUrl = `${environment.apiUrl}/categories`;

  constructor(private readonly http: HttpClient) {}

  list(type?: CategoryType) {
    return this.http.get<Category[]>(this.baseUrl, { params: type ? { type } : {} });
  }

  create(payload: CreateCategoryPayload) {
    return this.http.post<Category>(this.baseUrl, payload);
  }

  update(id: string, payload: Partial<CreateCategoryPayload>) {
    return this.http.patch<Category>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
