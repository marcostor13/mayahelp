import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ALLOW_PENDING_PASSWORD_KEY } from '../decorators/allow-pending-password.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';

/**
 * Cierra la API a quien entró con una contraseña temporal y todavía no eligió la suya.
 *
 * El flag viaja en el access token, así que no cuesta una consulta por request. A cambio,
 * si a alguien le resetean la cuenta mientras tiene una sesión abierta, su token viejo
 * sigue valiendo hasta que expira (15 min por defecto); el reseteo además borra su refresh
 * token, así que esa sesión no se puede renovar y muere ahí.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) {
      return true;
    }
    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    if (user?.mustChangePassword) {
      throw new ForbiddenException(
        'Tenés que elegir una contraseña nueva antes de seguir',
      );
    }
    return true;
  }
}
