import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestWithUser } from '../interfaces/request-with-user.interface';

/**
 * Centralized RBAC enforcement — the only place role checks happen, per
 * prompts task §13 ("Do not scatter role checks throughout controllers").
 * Must run after JwtAuthGuard (needs request.user already populated).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException('Authentication required.');
    }

    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    return true;
  }
}
