import type { UserRole } from '@prisma/client';

/** Minimum identity information required to authorize a request — no PII. */
export interface JwtPayload {
  sub: string;
  role: UserRole;
}
