import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Article } from '../models/article.model';

@Injectable({ providedIn: 'root' })
export class ArticleService {
  private readonly baseUrl = `${environment.apiUrl}/articles`;

  constructor(private readonly http: HttpClient) {}

  list(params: { category?: string; search?: string; popular?: boolean } = {}) {
    const query: Record<string, string> = {};
    if (params.category) query['category'] = params.category;
    if (params.search) query['search'] = params.search;
    if (params.popular) query['popular'] = 'true';
    return this.http.get<Article[]>(this.baseUrl, { params: query });
  }

  getById(id: string) {
    return this.http.get<Article>(`${this.baseUrl}/${id}`);
  }
}
