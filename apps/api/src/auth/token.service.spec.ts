import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { TokenService } from './token.service';

/**
 * A fake ConfigService, not the real class. Importing `@prisma/client`
 * (for the UserRole type) has a documented side effect of dotenv-loading
 * the repo-root .env into process.env, and the real ConfigService prefers
 * process.env over constructor-supplied values — which would make two
 * "different secret" test configs silently collapse to the same real .env
 * secret. A fake, fully isolated from process.env, is what actually tests
 * TokenService's own secret-handling logic.
 */
function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('TokenService', () => {
  const config = fakeConfig({
    JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-chars-long',
    JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars-long',
    JWT_ACCESS_TTL: '15m',
  });
  const service = new TokenService(new JwtService(), config);

  it('signs an access token that verifies back to the same payload', async () => {
    const token = await service.signAccessToken({ sub: 'user-1', role: UserRole.USER });
    const payload = await service.verifyAccessToken(token);

    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe(UserRole.USER);
  });

  it('rejects a token signed with a different secret', async () => {
    const otherConfig = fakeConfig({
      JWT_ACCESS_SECRET: 'a-completely-different-secret-value-here',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars-long',
    });
    const otherService = new TokenService(new JwtService(), otherConfig);
    const token = await otherService.signAccessToken({ sub: 'user-1', role: UserRole.USER });

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('generates opaque tokens that are unique and reasonably long', () => {
    const a = service.generateOpaqueToken();
    const b = service.generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(40);
  });

  it('hashes opaque tokens deterministically and distinctly per input', () => {
    const token = service.generateOpaqueToken();
    expect(service.hashOpaqueToken(token)).toBe(service.hashOpaqueToken(token));
    expect(service.hashOpaqueToken(token)).not.toBe(
      service.hashOpaqueToken(service.generateOpaqueToken()),
    );
  });

  it('produces different hashes for the same token under different secrets (keyed hash)', () => {
    const otherConfig = fakeConfig({
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-chars-long',
      JWT_REFRESH_SECRET: 'a-totally-different-refresh-secret-value',
    });
    const otherService = new TokenService(new JwtService(), otherConfig);
    const token = service.generateOpaqueToken();

    expect(service.hashOpaqueToken(token)).not.toBe(otherService.hashOpaqueToken(token));
  });
});
