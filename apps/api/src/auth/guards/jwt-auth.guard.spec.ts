import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { TokenService } from '../token.service';

function buildContext(headers: Record<string, string | undefined>): ExecutionContext {
  const request: any = { headers, user: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let tokenService: jest.Mocked<TokenService>;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    tokenService = { verifyAccessToken: jest.fn() } as unknown as jest.Mocked<TokenService>;
    guard = new JwtAuthGuard(tokenService);
  });

  it('throws Unauthorized when no Authorization header is present', async () => {
    const context = buildContext({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws Unauthorized when the header is not a Bearer token', async () => {
    const context = buildContext({ authorization: 'Basic abc123' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws Unauthorized when the token fails verification (expired/malformed/wrong secret)', async () => {
    tokenService.verifyAccessToken.mockRejectedValue(new Error('jwt malformed'));
    const context = buildContext({ authorization: 'Bearer bad.token.here' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows the request and populates request.user when the token is valid', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({ sub: 'user-1', role: UserRole.ADMIN });
    const request: any = { headers: { authorization: 'Bearer good.token.here' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 'user-1', role: UserRole.ADMIN });
  });
});
