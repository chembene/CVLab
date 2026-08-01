import type { PasswordResetToken, VerificationToken } from '@prisma/client';
import { VerificationService } from './verification.service';
import type { VerificationRepository } from './verification.repository';
import type { TokenService } from '../token.service';

function buildToken(overrides: Partial<VerificationToken> = {}): VerificationToken {
  return {
    id: 'token-1',
    userId: 'user-1',
    tokenHash: 'hash-1',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    consumedAt: null,
    ...overrides,
  };
}

describe('VerificationService', () => {
  let repository: jest.Mocked<VerificationRepository>;
  let tokenService: jest.Mocked<TokenService>;
  let service: VerificationService;

  beforeEach(() => {
    repository = {
      createEmailVerificationToken: jest.fn(),
      findEmailVerificationTokenByHash: jest.fn(),
      consumeEmailVerificationToken: jest.fn(),
      createPasswordResetToken: jest.fn(),
      findPasswordResetTokenByHash: jest.fn(),
      consumePasswordResetToken: jest.fn(),
    } as unknown as jest.Mocked<VerificationRepository>;

    tokenService = {
      generateOpaqueToken: jest.fn(() => 'raw-token'),
      hashOpaqueToken: jest.fn((raw: string) => `hash-of-${raw}`),
    } as unknown as jest.Mocked<TokenService>;

    service = new VerificationService(repository, tokenService);
  });

  describe('email verification tokens', () => {
    it('creates a token storing only the hash', async () => {
      await service.createEmailVerificationToken('user-1');

      expect(repository.createEmailVerificationToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', tokenHash: 'hash-of-raw-token' }),
      );
    });

    it('consumes a valid, unexpired, unconsumed token', async () => {
      repository.findEmailVerificationTokenByHash.mockResolvedValue(buildToken());

      const result = await service.consumeEmailVerificationToken('raw-token');

      expect(result).toEqual({ userId: 'user-1' });
      expect(repository.consumeEmailVerificationToken).toHaveBeenCalledWith('token-1');
    });

    it('rejects an already-consumed token', async () => {
      repository.findEmailVerificationTokenByHash.mockResolvedValue(
        buildToken({ consumedAt: new Date() }),
      );

      const result = await service.consumeEmailVerificationToken('raw-token');

      expect(result).toBeNull();
      expect(repository.consumeEmailVerificationToken).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      repository.findEmailVerificationTokenByHash.mockResolvedValue(
        buildToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      const result = await service.consumeEmailVerificationToken('raw-token');

      expect(result).toBeNull();
    });

    it('rejects an unknown token', async () => {
      repository.findEmailVerificationTokenByHash.mockResolvedValue(null);

      const result = await service.consumeEmailVerificationToken('raw-token');

      expect(result).toBeNull();
    });
  });

  describe('password reset tokens', () => {
    function buildResetToken(overrides: Partial<PasswordResetToken> = {}): PasswordResetToken {
      return buildToken(overrides) as PasswordResetToken;
    }

    it('creates a token storing only the hash', async () => {
      await service.createPasswordResetToken('user-1');

      expect(repository.createPasswordResetToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', tokenHash: 'hash-of-raw-token' }),
      );
    });

    it('consumes a valid token and rejects a reused one', async () => {
      repository.findPasswordResetTokenByHash.mockResolvedValue(buildResetToken());
      const result = await service.consumePasswordResetToken('raw-token');
      expect(result).toEqual({ userId: 'user-1' });

      repository.findPasswordResetTokenByHash.mockResolvedValue(
        buildResetToken({ consumedAt: new Date() }),
      );
      const secondAttempt = await service.consumePasswordResetToken('raw-token');
      expect(secondAttempt).toBeNull();
    });
  });
});
