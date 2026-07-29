import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SearchResults } from '../models/search.model';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly baseUrl = `${environment.apiUrl}/search`;

  /**
   * Open state lives here rather than in the palette component so the topbar (and
   * any future entry point) can open it without a template reference.
   */
  readonly isOpen = signal(false);

  constructor(private readonly http: HttpClient) {}

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggle(): void {
    this.isOpen.update((open) => !open);
  }

  search(q: string) {
    return this.http.get<SearchResults>(this.baseUrl, { params: { q } });
  }
}
