export type Role = 'admin' | 'agent' | 'client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  company?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
