import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes } from 'node:crypto';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * Access tokens are signed JWTs (short-lived, stateless — see
 * docs/architecture/security-architecture.md §1.1). Refresh/verification/
 * reset tokens are opaque high-entropy random strings, hashed with
 * HMAC-SHA256 (keyed by JWT_REFRESH_SECRET) before persistence — bcrypt is
 * deliberately not used here: it exists to slow down brute-forcing of
 * low-entropy, human-chosen secrets (passwords), which provides no benefit
 * for an already-unguessable 384-bit random token and would only add
 * unnecessary latency to every refresh/verification request.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_TTL') ?? '15m',
    });
  }

  verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  /** 384 bits of entropy, URL-safe. Used for refresh/verification/reset tokens. */
  generateOpaqueToken(): string {
    return randomBytes(48).toString('base64url');
  }

  hashOpaqueToken(rawToken: string): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET') as string;
    return createHmac('sha256', secret).update(rawToken).digest('hex');
  }
}
