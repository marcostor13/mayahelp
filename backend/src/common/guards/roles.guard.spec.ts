import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../enums/role.enum';

function context(user?: { role: Role }): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(roles: Role[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('lets through a route that declares no roles', () => {
    expect(guardRequiring(undefined).canActivate(context())).toBe(true);
  });

  it('accepts a user whose role is listed', () => {
    const guard = guardRequiring([Role.ADMIN, Role.AGENT]);

    expect(guard.canActivate(context({ role: Role.AGENT }))).toBe(true);
    expect(guard.canActivate(context({ role: Role.CLIENT }))).toBe(false);
  });

  /**
   * The reason the workflow callback lives in its own controller: this guard reads the
   * roles of the class too, so `@Public()` on a handler is not enough to reach a
   * controller that declares `@Roles(...)` — the request arrives with no user and is
   * rejected before the handler runs.
   */
  it('rejects an unauthenticated request when the controller requires a role', () => {
    expect(guardRequiring([Role.ADMIN]).canActivate(context(undefined))).toBe(
      false,
    );
  });
});
