import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus, type User } from '@prisma/client';
import { AuthService } from './auth.service';
import type { UsersService } from '../users/users.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';
import type { SessionsService } from './sessions/sessions.service';
import type { VerificationService } from './verification/verification.service';

function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'jane@example.com',
    phone: null,
    passwordHash: 'stored-hash',
    status: UserStatus.ACTIVE,
    role: UserRole.USER,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  let usersService: jest.Mocked<UsersService>;
  let passwordService: jest.Mocked<PasswordService>;
  let tokenService: jest.Mocked<TokenService>;
  let sessionsService: jest.Mocked<SessionsService>;
  let verificationService: jest.Mocked<VerificationService>;

  function buildService(nodeEnv: 'development' | 'production' = 'development') {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      registerUser: jest.fn(),
      setStatus: jest.fn(),
      updatePasswordHash: jest.fn(),
      toSafeUser: jest.fn((user: User) => ({
        id: user.id,
        email: user.email,
        role: user.role as unknown as import('@cvlab/types').UserRole,
        status: user.status as unknown as import('@cvlab/types').UserStatus,
        createdAt: user.createdAt.toISOString(),
      })),
    } as unknown as jest.Mocked<UsersService>;

    passwordService = {
      hash: jest.fn(async (p: string) => `hashed(${p})`),
      verify: jest.fn(),
      getDummyHash: jest.fn(async () => 'dummy-hash'),
    } as unknown as jest.Mocked<PasswordService>;

    tokenService = {
      signAccessToken: jest.fn(async () => 'access-token-xyz'),
    } as unknown as jest.Mocked<TokenService>;

    sessionsService = {
      createSession: jest.fn(async () => ({ session: {} as any, rawToken: 'raw-refresh-token' })),
      rotate: jest.fn(),
      revokeByRawToken: jest.fn(),
      revokeAllForUser: jest.fn(),
    } as unknown as jest.Mocked<SessionsService>;

    verificationService = {
      createEmailVerificationToken: jest.fn(async () => ({ rawToken: 'verify-raw-token' })),
      consumeEmailVerificationToken: jest.fn(),
      createPasswordResetToken: jest.fn(async () => ({ rawToken: 'reset-raw-token' })),
      consumePasswordResetToken: jest.fn(),
    } as unknown as jest.Mocked<VerificationService>;

    return new AuthService(
      usersService,
      passwordService,
      tokenService,
      sessionsService,
      verificationService,
      fakeConfig({ NODE_ENV: nodeEnv }),
    );
  }

  describe('register', () => {
    it('hashes the password, creates the user, issues a verification token, and includes it only outside production', async () => {
      const devService = buildService('development');
      usersService.registerUser.mockResolvedValue(
        buildUser({ status: UserStatus.PENDING_VERIFICATION }),
      );

      const devResult = await devService.register({
        email: 'jane@example.com',
        password: 'Sup3rSecret!',
      });

      expect(passwordService.hash).toHaveBeenCalledWith('Sup3rSecret!');
      expect(usersService.registerUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@example.com',
          passwordHash: 'hashed(Sup3rSecret!)',
        }),
      );
      expect(devResult.devVerificationToken).toBe('verify-raw-token');
      expect(devResult.user).not.toHaveProperty('passwordHash');

      const prodService = buildService('production');
      usersService.registerUser.mockResolvedValue(
        buildUser({ status: UserStatus.PENDING_VERIFICATION }),
      );
      const prodResult = await prodService.register({
        email: 'jane@example.com',
        password: 'Sup3rSecret!',
      });
      expect(prodResult.devVerificationToken).toBeUndefined();
    });
  });

  describe('login', () => {
    it('rejects with a generic error for an unknown email, still performing a password comparison (timing safety)', async () => {
      const service = buildService();
      usersService.findByEmail.mockResolvedValue(null);
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(passwordService.getDummyHash).toHaveBeenCalled();
      expect(passwordService.verify).toHaveBeenCalledWith('x', 'dummy-hash');
      expect(sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('rejects with the same generic error for a wrong password on a known email', async () => {
      const service = buildService();
      usersService.findByEmail.mockResolvedValue(buildUser());
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'jane@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(passwordService.verify).toHaveBeenCalledWith('wrong', 'stored-hash');
    });

    it.each([UserStatus.SUSPENDED, UserStatus.DELETED])(
      'rejects login for %s accounts even with the correct password',
      async (status) => {
        const service = buildService();
        usersService.findByEmail.mockResolvedValue(buildUser({ status }));
        passwordService.verify.mockResolvedValue(true);

        await expect(
          service.login({ email: 'jane@example.com', password: 'correct' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(sessionsService.createSession).not.toHaveBeenCalled();
      },
    );

    it.each([UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION])(
      'allows login for %s accounts with the correct password',
      async (status) => {
        const service = buildService();
        usersService.findByEmail.mockResolvedValue(buildUser({ status }));
        passwordService.verify.mockResolvedValue(true);

        const result = await service.login({ email: 'jane@example.com', password: 'correct' });

        expect(result.accessToken).toBe('access-token-xyz');
        expect(result.rawRefreshToken).toBe('raw-refresh-token');
        expect(sessionsService.createSession).toHaveBeenCalledWith('user-1');
      },
    );
  });

  describe('refresh', () => {
    it('rejects with a generic error when the session is invalid', async () => {
      const service = buildService();
      sessionsService.rotate.mockResolvedValue({ status: 'invalid' });
      await expect(service.refresh('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects with a generic error and logs safely when reuse is detected', async () => {
      const service = buildService();
      sessionsService.rotate.mockResolvedValue({
        status: 'reused',
        userId: 'user-1',
        familyId: 'family-1',
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await expect(service.refresh('stale-token')).rejects.toBeInstanceOf(UnauthorizedException);

      const logged = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(logged).not.toContain('stale-token');
      consoleSpy.mockRestore();
    });

    it('revokes all sessions and rejects when the account is no longer allowed to log in', async () => {
      const service = buildService();
      sessionsService.rotate.mockResolvedValue({
        status: 'ok',
        session: { userId: 'user-1' } as any,
        rawToken: 'new-raw-token',
      });
      usersService.findById.mockResolvedValue(buildUser({ status: UserStatus.SUSPENDED }));

      await expect(service.refresh('valid-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessionsService.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('issues a new access token and returns the rotated refresh token on success', async () => {
      const service = buildService();
      sessionsService.rotate.mockResolvedValue({
        status: 'ok',
        session: { userId: 'user-1' } as any,
        rawToken: 'new-raw-token',
      });
      usersService.findById.mockResolvedValue(buildUser());

      const result = await service.refresh('valid-token');

      expect(result.accessToken).toBe('access-token-xyz');
      expect(result.rawRefreshToken).toBe('new-raw-token');
    });
  });

  describe('logout / logoutAll', () => {
    it('revokes the session when a refresh token is present', async () => {
      const service = buildService();
      await service.logout('some-token');
      expect(sessionsService.revokeByRawToken).toHaveBeenCalledWith('some-token');
    });

    it('is a no-op when no refresh token is present', async () => {
      const service = buildService();
      await service.logout(undefined);
      expect(sessionsService.revokeByRawToken).not.toHaveBeenCalled();
    });

    it('revokes every session for logoutAll', async () => {
      const service = buildService();
      await service.logoutAll('user-1');
      expect(sessionsService.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('forgotPassword / resetPassword (enumeration-safe)', () => {
    it('returns the same empty shape for an unknown email as for a known one in production', async () => {
      const service = buildService('production');
      usersService.findByEmail.mockResolvedValueOnce(null);
      const unknown = await service.forgotPassword('nobody@example.com');

      usersService.findByEmail.mockResolvedValueOnce(buildUser());
      const known = await service.forgotPassword('jane@example.com');

      expect(unknown).toEqual({});
      expect(known).toEqual({});
    });

    it('exposes a dev-only reset token outside production for a known, non-deleted account', async () => {
      const service = buildService('development');
      usersService.findByEmail.mockResolvedValue(buildUser());

      const result = await service.forgotPassword('jane@example.com');

      expect(result.devResetToken).toBe('reset-raw-token');
    });

    it('never issues a token for a deleted account', async () => {
      const service = buildService('development');
      usersService.findByEmail.mockResolvedValue(buildUser({ status: UserStatus.DELETED }));

      const result = await service.forgotPassword('jane@example.com');

      expect(result).toEqual({});
      expect(verificationService.createPasswordResetToken).not.toHaveBeenCalled();
    });

    it('rejects an invalid/expired reset token', async () => {
      const service = buildService();
      verificationService.consumePasswordResetToken.mockResolvedValue(null);

      const ok = await service.resetPassword('bad-token', 'NewPassword1');

      expect(ok).toBe(false);
      expect(usersService.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('updates the password and revokes all sessions on a valid reset token', async () => {
      const service = buildService();
      verificationService.consumePasswordResetToken.mockResolvedValue({ userId: 'user-1' });

      const ok = await service.resetPassword('good-token', 'NewPassword1');

      expect(ok).toBe(true);
      expect(usersService.updatePasswordHash).toHaveBeenCalledWith(
        'user-1',
        'hashed(NewPassword1)',
      );
      expect(sessionsService.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('verifyEmail', () => {
    it('activates the account on a valid token', async () => {
      const service = buildService();
      verificationService.consumeEmailVerificationToken.mockResolvedValue({ userId: 'user-1' });

      const ok = await service.verifyEmail('good-token');

      expect(ok).toBe(true);
      expect(usersService.setStatus).toHaveBeenCalledWith('user-1', UserStatus.ACTIVE);
    });

    it('rejects an invalid/expired/consumed token without changing status', async () => {
      const service = buildService();
      verificationService.consumeEmailVerificationToken.mockResolvedValue(null);

      const ok = await service.verifyEmail('bad-token');

      expect(ok).toBe(false);
      expect(usersService.setStatus).not.toHaveBeenCalled();
    });
  });
});
