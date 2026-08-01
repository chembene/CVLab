import type { ConfigService } from '@nestjs/config';
import type { Session } from '@prisma/client';
import { SessionsService } from './sessions.service';
import type { SessionsRepository } from './sessions.repository';
import type { TokenService } from '../token.service';

/**
 * A fake ConfigService. Importing the `Session` type from `@prisma/client`
 * below has the side effect of dotenv-loading the repo-root .env into
 * process.env, and the real ConfigService prefers process.env over
 * constructor-supplied values — this fake stays fully isolated from that,
 * so the test actually exercises SessionsService's own TTL handling
 * instead of accidentally matching whatever .env happens to contain.
 */
function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    userId: 'user-1',
    familyId: 'session-1',
    refreshTokenHash: 'hash-1',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    revokedAt: null,
    lastUsedAt: null,
    metadata: null,
    ...overrides,
  };
}

describe('SessionsService', () => {
  let repository: jest.Mocked<SessionsRepository>;
  let tokenService: jest.Mocked<TokenService>;
  let service: SessionsService;
  let tokenCounter: number;

  beforeEach(() => {
    tokenCounter = 0;
    repository = {
      create: jest.fn(),
      findByRefreshTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeFamily: jest.fn(),
      revokeAllForUser: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;

    tokenService = {
      generateOpaqueToken: jest.fn(() => `raw-token-${++tokenCounter}`),
      hashOpaqueToken: jest.fn((raw: string) => `hash-of-${raw}`),
    } as unknown as jest.Mocked<TokenService>;

    const configService = fakeConfig({ JWT_REFRESH_TTL: '30d' });
    service = new SessionsService(repository, tokenService, configService);
  });

  describe('createSession', () => {
    it('stores a hash, never the raw token, and uses the new session id as its own familyId', async () => {
      repository.create.mockImplementation((data) => Promise.resolve(buildSession(data)));

      const { rawToken } = await service.createSession('user-1');

      expect(repository.create).toHaveBeenCalledTimes(1);
      const firstCall = repository.create.mock.calls[0];
      if (!firstCall) {
        throw new Error('expected repository.create to have been called');
      }
      const createArg = firstCall[0];
      expect(createArg.refreshTokenHash).toBe(`hash-of-${rawToken}`);
      expect(createArg.familyId).toBe(createArg.id);
      expect(createArg.userId).toBe('user-1');
    });
  });

  describe('rotate', () => {
    it('returns "invalid" when the token hash is not found', async () => {
      repository.findByRefreshTokenHash.mockResolvedValue(null);

      const result = await service.rotate('unknown-token');

      expect(result).toEqual({ status: 'invalid' });
      expect(repository.revoke).not.toHaveBeenCalled();
    });

    it('rotates a valid, unrevoked, unexpired session into a new row in the same family', async () => {
      const existing = buildSession({ id: 'session-1', familyId: 'family-1', revokedAt: null });
      repository.findByRefreshTokenHash.mockResolvedValue(existing);
      repository.create.mockImplementation((data) => Promise.resolve(buildSession(data)));

      const result = await service.rotate('current-raw-token');

      expect(repository.revoke).toHaveBeenCalledWith('session-1');
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.session.familyId).toBe('family-1');
        expect(result.session.expiresAt).toBe(existing.expiresAt); // absolute cap preserved, not extended
        expect(result.rawToken).not.toBe('current-raw-token');
      }
    });

    it('detects reuse of an already-revoked token and revokes the entire family', async () => {
      const existing = buildSession({
        id: 'session-2',
        familyId: 'family-1',
        revokedAt: new Date(),
      });
      repository.findByRefreshTokenHash.mockResolvedValue(existing);

      const result = await service.rotate('stale-raw-token');

      expect(result).toEqual({ status: 'reused', userId: 'user-1', familyId: 'family-1' });
      expect(repository.revokeFamily).toHaveBeenCalledWith('family-1');
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('treats an expired-but-unrevoked session as expired, not as a valid rotation', async () => {
      const existing = buildSession({
        id: 'session-3',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      });
      repository.findByRefreshTokenHash.mockResolvedValue(existing);

      const result = await service.rotate('old-raw-token');

      expect(result).toEqual({ status: 'expired' });
      expect(repository.revoke).toHaveBeenCalledWith('session-3');
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('revokeByRawToken', () => {
    it('revokes the matching session when found and not already revoked', async () => {
      const existing = buildSession({ id: 'session-4', revokedAt: null });
      repository.findByRefreshTokenHash.mockResolvedValue(existing);

      await service.revokeByRawToken('some-raw-token');

      expect(repository.revoke).toHaveBeenCalledWith('session-4');
    });

    it('is a no-op when the token is unknown (idempotent logout)', async () => {
      repository.findByRefreshTokenHash.mockResolvedValue(null);

      await service.revokeByRawToken('unknown-token');

      expect(repository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllForUser', () => {
    it('delegates to the repository', async () => {
      await service.revokeAllForUser('user-1');
      expect(repository.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });
});
