import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { TokenService } from '../token.service';
import type { RequestWithUser } from '../interfaces/request-with-user.interface';

/**
 * Validates the `Authorization: Bearer <token>` access token and populates
 * `request.user`. Deliberately not built on Passport — a single JWT
 * strategy doesn't need that abstraction layer, and this keeps the
 * dependency footprint smaller (see auth-architecture notes in the Phase 1
 * completion report).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    try {
      const payload = await this.tokenService.verifyAccessToken(token);
      request.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }

  private extractToken(request: RequestWithUser): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return null;
    }
    return header.slice('Bearer '.length).trim() || null;
  }
}
