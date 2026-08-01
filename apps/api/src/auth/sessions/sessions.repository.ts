import { Injectable } from '@nestjs/common';
import type { Session } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateSessionData {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

/** Only Prisma access for the `sessions` table lives here — see UsersRepository for the same convention. */
@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateSessionData): Promise<Session> {
    return this.prisma.session.create({ data });
  }

  findByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { refreshTokenHash } });
  }

  /** Marks one session row revoked (superseded by rotation, logged out, or reused). */
  revoke(id: string): Promise<Session> {
    const now = new Date();
    return this.prisma.session.update({ where: { id }, data: { revokedAt: now, lastUsedAt: now } });
  }

  revokeFamily(familyId: string): Promise<{ count: number }> {
    return this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllForUser(userId: string): Promise<{ count: number }> {
    return this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
