import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestUser, RequestWithUser } from '../interfaces/request-with-user.interface';

/** Injects the authenticated user (populated by JwtAuthGuard) into a controller method. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
