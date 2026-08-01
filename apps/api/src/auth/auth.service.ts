import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import type { SafeUser } from '@cvlab/types';
import { UsersService } from '../users/users.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { SessionsService } from './sessions/sessions.service';
import { VerificationService } from './verification/verification.service';
import { AppLogger } from '../common/logger/app-logger.service';

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
  rawRefreshToken: string;
}

export interface RefreshResult {
  user: SafeUser;
  accessToken: string;
  rawRefreshToken: string;
}

/**
 * Orchestrates registration/login/refresh/logout/password-reset/email-
 * verification by composing UsersService, PasswordService, TokenService,
 * SessionsService and VerificationService. Contains no direct Prisma
 * access and no business logic belonging to other modules (credits,
 * payments, CVs, ...) — see docs/architecture/module-boundaries.md.
 */
@Injectable()
export class AuthService {
  private readonly logger = new AppLogger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionsService: SessionsService,
    private readonly verificationService: VerificationService,
    private readonly configService: ConfigService,
  ) {}

  private isDev(): boolean {
    return this.configService.get<string>('NODE_ENV') !== 'production';
  }

  /** Statuses allowed to authenticate. See prompts task §15 for the resolved policy. */
  private isLoginAllowed(status: UserStatus): boolean {
    return status === UserStatus.ACTIVE || status === UserStatus.PENDING_VERIFICATION;
  }

  async register(input: { email: string; password: string; phone?: string }): Promise<{
    user: SafeUser;
    devVerificationToken?: string;
  }> {
    const passwordHash = await this.passwordService.hash(input.password);
    const user = await this.usersService.registerUser({
      email: input.email,
      passwordHash,
      phone: input.phone,
    });

    const { rawToken } = await this.verificationService.createEmailVerificationToken(user.id);
    this.logger.log({ event: 'user_registered', userId: user.id });

    return {
      user: this.usersService.toSafeUser(user),
      // Dev-only escape hatch: no real email provider exists yet (see
      // docs/architecture/ai-... no — see security-architecture.md addendum
      // and README "Known Limitations"). Never enabled in production.
      ...(this.isDev() ? { devVerificationToken: rawToken } : {}),
    };
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(input.email);
    // Timing-safety: always run a bcrypt comparison, even when the user is
    // unknown, so response time doesn't reveal whether the email exists.
    const hashToCompare = user ? user.passwordHash : await this.passwordService.getDummyHash();
    const passwordValid = await this.passwordService.verify(input.password, hashToCompare);

    if (!user || !passwordValid || !this.isLoginAllowed(user.status)) {
      this.logger.warn({
        event: 'login_failed',
        reason: !user ? 'unknown_email' : !passwordValid ? 'bad_password' : 'status_blocked',
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    const { rawToken } = await this.sessionsService.createSession(user.id);
    const accessToken = await this.tokenService.signAccessToken({ sub: user.id, role: user.role });
    this.logger.log({ event: 'login_success', userId: user.id });

    return { user: this.usersService.toSafeUser(user), accessToken, rawRefreshToken: rawToken };
  }

  async refresh(rawRefreshToken: string): Promise<RefreshResult> {
    const result = await this.sessionsService.rotate(rawRefreshToken);

    if (result.status === 'reused') {
      this.logger.warn({
        event: 'refresh_token_reuse_detected',
        userId: result.userId,
        familyId: result.familyId,
      });
      throw new UnauthorizedException('Invalid session.');
    }
    if (result.status !== 'ok') {
      throw new UnauthorizedException('Invalid session.');
    }

    const user = await this.usersService.findById(result.session.userId);
    if (!user || !this.isLoginAllowed(user.status)) {
      // Account was suspended/deleted after the session was issued — this
      // is where that gets enforced (see the Phase 1 report's "known
      // limitations" note on access-token revocation lag).
      await this.sessionsService.revokeAllForUser(result.session.userId);
      this.logger.warn({ event: 'refresh_denied_account_status', userId: result.session.userId });
      throw new UnauthorizedException('Invalid session.');
    }

    const accessToken = await this.tokenService.signAccessToken({ sub: user.id, role: user.role });
    return {
      user: this.usersService.toSafeUser(user),
      accessToken,
      rawRefreshToken: result.rawToken,
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) {
      await this.sessionsService.revokeByRawToken(rawRefreshToken);
    }
    this.logger.log({ event: 'logout' });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionsService.revokeAllForUser(userId);
    this.logger.log({ event: 'logout_all', userId });
  }

  async getSafeUserById(userId: string): Promise<SafeUser | null> {
    const user = await this.usersService.findById(userId);
    return user ? this.usersService.toSafeUser(user) : null;
  }

  async forgotPassword(email: string): Promise<{ devResetToken?: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.status === UserStatus.DELETED) {
      // Same response either way — never reveal whether the email exists.
      return {};
    }

    const { rawToken } = await this.verificationService.createPasswordResetToken(user.id);
    this.logger.log({ event: 'password_reset_requested', userId: user.id });
    return this.isDev() ? { devResetToken: rawToken } : {};
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<boolean> {
    const result = await this.verificationService.consumePasswordResetToken(rawToken);
    if (!result) {
      return false;
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.usersService.updatePasswordHash(result.userId, passwordHash);
    // A password reset ends every existing session — see prisma/schema.prisma's
    // PasswordResetToken doc comment.
    await this.sessionsService.revokeAllForUser(result.userId);
    this.logger.log({ event: 'password_reset_completed', userId: result.userId });
    return true;
  }

  async resendVerification(email: string): Promise<{ devVerificationToken?: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) {
      return {};
    }

    const { rawToken } = await this.verificationService.createEmailVerificationToken(user.id);
    return this.isDev() ? { devVerificationToken: rawToken } : {};
  }

  async verifyEmail(rawToken: string): Promise<boolean> {
    const result = await this.verificationService.consumeEmailVerificationToken(rawToken);
    if (!result) {
      return false;
    }

    await this.usersService.setStatus(result.userId, UserStatus.ACTIVE);
    this.logger.log({ event: 'email_verified', userId: result.userId });
    return true;
  }
}
