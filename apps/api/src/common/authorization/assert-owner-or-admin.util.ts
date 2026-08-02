import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { RequestUser } from '../../auth/interfaces/request-with-user.interface';

/**
 * "Only owner accesses own profile. Admin bypass." — the one place this
 * check happens for the Resume Engine (Profile/MasterResume/sections), so
 * it isn't scattered across services. Every Phase 2A endpoint is
 * self-service only (`/api/v1/profile`, `/api/v1/resume`, ... always
 * resolve to the requesting user), but each service method still takes an
 * explicit `targetUserId` and calls this — that's what lets a future
 * admin-facing route (Phase 12) reuse the same service methods for another
 * user's data without touching this authorization logic.
 */
export function assertOwnerOrAdmin(requestingUser: RequestUser, targetUserId: string): void {
  const isOwner = requestingUser.id === targetUserId;
  const isAdmin =
    requestingUser.role === UserRole.ADMIN || requestingUser.role === UserRole.SUPER_ADMIN;

  if (!isOwner && !isAdmin) {
    throw new ForbiddenException('Insufficient permissions.');
  }
}
