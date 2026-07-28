import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Category, CategoryType } from '../models/category.model';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly baseUrl = `${environment.apiUrl}/categories`;

  constructor(private readonly http: HttpClient) {}

  list(type?: CategoryType) {
    return this.http.get<Category[]>(this.baseUrl, { params: type ? { type } : {} });
  }
}
