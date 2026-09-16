import { Role } from '../../common/enums/role.enum';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
  /** Dueño de la plataforma: ve todos los proyectos sin necesidad de asignación. */
  isSuperAdmin: boolean;
  /** True mientras la persona no cambie la contraseña temporal de un reseteo. */
  mustChangePassword: boolean;
}
