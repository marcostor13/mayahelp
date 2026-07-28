import { Role } from '../../common/enums/role.enum';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}
