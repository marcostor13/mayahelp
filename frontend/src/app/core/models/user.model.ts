export type Role = 'admin' | 'agent' | 'client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Dueño de la plataforma: ve todos los proyectos sin necesidad de asignación. */
  isSuperAdmin?: boolean;
  company?: string;
  phone?: string;
  isActive?: boolean;
  notifications?: { email: boolean; whatsapp: boolean };
  /** Marcado por un reseteo de cuenta: hay que elegir una contraseña propia para seguir. */
  mustChangePassword?: boolean;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
