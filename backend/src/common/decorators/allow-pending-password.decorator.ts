import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPassword';

/**
 * Deja pasar el endpoint aunque la persona tenga el cambio de contraseña pendiente.
 * Solo para lo que necesita hacer para salir de ese estado: verse a sí misma,
 * cambiar la contraseña y cerrar sesión.
 */
export const AllowPendingPassword = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);
