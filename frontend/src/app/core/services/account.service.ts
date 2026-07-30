import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AccountSummary } from '../models/account.model';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly baseUrl = `${environment.apiUrl}/dashboard`;

  constructor(private readonly http: HttpClient) {}

  /** Stats and projects of the signed-in person. */
  getSummary() {
    return this.http.get<AccountSummary>(`${this.baseUrl}/account`);
  }
}
