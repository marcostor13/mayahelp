import { Role } from '../../common/enums/role.enum';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
  /** True mientras la persona no cambie la contraseña temporal de un reseteo. */
  mustChangePassword: boolean;
}
