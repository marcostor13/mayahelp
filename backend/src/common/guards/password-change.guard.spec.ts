import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PasswordChangeGuard } from './password-change.guard';
import { Role } from '../enums/role.enum';

function context(user?: { role: Role; mustChangePassword: boolean }) {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guard(allowed: boolean | undefined): PasswordChangeGuard {
  return new PasswordChangeGuard({
    getAllAndOverride: () => allowed,
  } as unknown as Reflector);
}

const pending = { role: Role.CLIENT, mustChangePassword: true };
const settled = { role: Role.CLIENT, mustChangePassword: false };

describe('PasswordChangeGuard', () => {
  it('deja pasar a quien ya eligió su contraseña', () => {
    expect(guard(undefined).canActivate(context(settled))).toBe(true);
  });

  it('bloquea a quien tiene el cambio pendiente', () => {
    expect(() => guard(undefined).canActivate(context(pending))).toThrow(
      ForbiddenException,
    );
  });

  it('deja pasar los endpoints marcados con @AllowPendingPassword', () => {
    expect(guard(true).canActivate(context(pending))).toBe(true);
  });

  /** Las rutas públicas llegan sin req.user; el guard no es quien las tiene que frenar. */
  it('deja pasar una request sin usuario', () => {
    expect(guard(undefined).canActivate(context(undefined))).toBe(true);
  });
});
