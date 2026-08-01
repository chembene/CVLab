import { Injectable } from '@nestjs/common';
import { TokenService } from '../token.service';
import { EMAIL_VERIFICATION_TOKEN_TTL_MS, PASSWORD_RESET_TOKEN_TTL_MS } from '../auth.constants';
import { VerificationRepository } from './verification.repository';

/**
 * Owns email-verification and password-reset token lifecycles (create,
 * consume). Tokens are opaque random strings; only their HMAC hash is ever
 * persisted (see TokenService). Consumption is single-use — a token is
 * checked for existence, non-consumption, and non-expiry, then immediately
 * marked consumed in the same lookup-to-consume path.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly verificationRepository: VerificationRepository,
    private readonly tokenService: TokenService,
  ) {}

  async createEmailVerificationToken(userId: string): Promise<{ rawToken: string }> {
    const rawToken = this.tokenService.generateOpaqueToken();
    await this.verificationRepository.createEmailVerificationToken({
      userId,
      tokenHash: this.tokenService.hashOpaqueToken(rawToken),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
    });
    return { rawToken };
  }

  async consumeEmailVerificationToken(rawToken: string): Promise<{ userId: string } | null> {
    const record = await this.verificationRepository.findEmailVerificationTokenByHash(
      this.tokenService.hashOpaqueToken(rawToken),
    );
    if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
      return null;
    }
    await this.verificationRepository.consumeEmailVerificationToken(record.id);
    return { userId: record.userId };
  }

  async createPasswordResetToken(userId: string): Promise<{ rawToken: string }> {
    const rawToken = this.tokenService.generateOpaqueToken();
    await this.verificationRepository.createPasswordResetToken({
      userId,
      tokenHash: this.tokenService.hashOpaqueToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
    });
    return { rawToken };
  }

  async consumePasswordResetToken(rawToken: string): Promise<{ userId: string } | null> {
    const record = await this.verificationRepository.findPasswordResetTokenByHash(
      this.tokenService.hashOpaqueToken(rawToken),
    );
    if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
      return null;
    }
    await this.verificationRepository.consumePasswordResetToken(record.id);
    return { userId: record.userId };
  }
}
