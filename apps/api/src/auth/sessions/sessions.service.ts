import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Session } from '@prisma/client';
import { TokenService } from '../token.service';
import { parseDurationToMs } from '../utils/duration.util';
import { SessionsRepository } from './sessions.repository';

export type RotateResult =
  | { status: 'ok'; session: Session; rawToken: string }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'reused'; userId: string; familyId: string };

/**
 * Owns refresh-token rotation and reuse detection. Each row in `sessions`
 * represents one issued refresh token; rotation revokes the presented row
 * and creates a new row in the same familyId chain (see
 * prisma/schema.prisma's Session model doc comment and
 * docs/architecture/security-architecture.md §1.1).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {}

  private refreshTtlMs(): number {
    return parseDurationToMs(this.configService.get<string>('JWT_REFRESH_TTL') ?? '30d');
  }

  /** Starts a new session family (login). */
  async createSession(userId: string): Promise<{ session: Session; rawToken: string }> {
    const id = randomUUID();
    const rawToken = this.tokenService.generateOpaqueToken();
    const refreshTokenHash = this.tokenService.hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());

    const session = await this.sessionsRepository.create({
      id,
      userId,
      familyId: id,
      refreshTokenHash,
      expiresAt,
    });

    return { session, rawToken };
  }

  /**
   * Validates a presented refresh token and rotates it.
   *
   * - Unknown hash              -> 'invalid' (never issued, or long since pruned)
   * - Found, already revoked    -> 'reused'  (compromise signal: revoke the whole family)
   * - Found, valid, but expired -> 'expired' (revoke this row, absolute lifetime reached)
   * - Found, valid, not expired -> 'ok'      (revoke this row, issue the next row in the family)
   */
  async rotate(rawToken: string): Promise<RotateResult> {
    const hash = this.tokenService.hashOpaqueToken(rawToken);
    const existing = await this.sessionsRepository.findByRefreshTokenHash(hash);

    if (!existing) {
      return { status: 'invalid' };
    }

    if (existing.revokedAt) {
      await this.sessionsRepository.revokeFamily(existing.familyId);
      return { status: 'reused', userId: existing.userId, familyId: existing.familyId };
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      await this.sessionsRepository.revoke(existing.id);
      return { status: 'expired' };
    }

    await this.sessionsRepository.revoke(existing.id);

    const newId = randomUUID();
    const newRawToken = this.tokenService.generateOpaqueToken();
    const newHash = this.tokenService.hashOpaqueToken(newRawToken);

    const newSession = await this.sessionsRepository.create({
      id: newId,
      userId: existing.userId,
      familyId: existing.familyId,
      refreshTokenHash: newHash,
      // Absolute session lifetime is capped at the original login + 30d —
      // rotation refreshes the credential, not the expiry.
      expiresAt: existing.expiresAt,
    });

    return { status: 'ok', session: newSession, rawToken: newRawToken };
  }

  async revokeByRawToken(rawToken: string): Promise<void> {
    const hash = this.tokenService.hashOpaqueToken(rawToken);
    const existing = await this.sessionsRepository.findByRefreshTokenHash(hash);
    if (existing && !existing.revokedAt) {
      await this.sessionsRepository.revoke(existing.id);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessionsRepository.revokeAllForUser(userId);
  }
}
