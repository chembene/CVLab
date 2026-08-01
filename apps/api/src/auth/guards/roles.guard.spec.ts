import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function buildContext(user: { id: string; role: UserRole } | undefined): ExecutionContext {
  const request: any = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function buildGuard(requiredRoles: UserRole[] | undefined) {
    const reflector = { getAllAndOverride: jest.fn(() => requiredRoles) } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('allows the request when no @Roles metadata is present (route is not role-restricted)', () => {
    const guard = buildGuard(undefined);
    const context = buildContext({ id: 'user-1', role: UserRole.USER });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows the request when the user has one of the required roles', () => {
    const guard = buildGuard([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    const context = buildContext({ id: 'user-1', role: UserRole.ADMIN });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws Forbidden when the user role is not in the required set', () => {
    const guard = buildGuard([UserRole.ADMIN]);
    const context = buildContext({ id: 'user-1', role: UserRole.USER });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws Unauthorized when the route is role-restricted but no user is on the request', () => {
    const guard = buildGuard([UserRole.ADMIN]);
    const context = buildContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
