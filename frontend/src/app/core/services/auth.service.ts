import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, User } from '../models/user.model';

const ACCESS_TOKEN_KEY = 'mayahelp_access_token';
const REFRESH_TOKEN_KEY = 'mayahelp_refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = `${environment.apiUrl}/auth`;
  private readonly usersUrl = `${environment.apiUrl}/users`;

  private readonly currentUserSignal = signal<User | null>(null);
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  constructor(private readonly http: HttpClient) {}

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  async bootstrap(): Promise<void> {
    if (!this.accessToken) {
      return;
    }
    try {
      const user = await firstValueFrom(this.http.get<User>(`${this.usersUrl}/me`));
      this.currentUserSignal.set(user);
    } catch {
      this.clearSession();
    }
  }

  async login(email: string, password: string): Promise<User> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.baseUrl}/login`, { email, password }),
    );
    return this.applySession(response);
  }

  async register(payload: {
    name: string;
    email: string;
    password: string;
    company?: string;
  }): Promise<User> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.baseUrl}/register`, payload),
    );
    return this.applySession(response);
  }

  async refreshSession(): Promise<string> {
    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      throw new Error('No hay sesión activa');
    }
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.baseUrl}/refresh`, { refreshToken }),
    );
    this.applySession(response);
    return response.accessToken;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.baseUrl}/logout`, {}));
    } finally {
      this.clearSession();
    }
  }

  private applySession(response: AuthResponse): User {
    localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    this.currentUserSignal.set(response.user);
    return response.user;
  }

  private clearSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    this.currentUserSignal.set(null);
  }
}
