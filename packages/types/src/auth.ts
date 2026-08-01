import type { UserRole, UserStatus } from './enums';

/**
 * The user shape returned by the API — never includes passwordHash or any
 * token/session material. See docs/architecture/security-architecture.md §6.
 */
export interface SafeUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

/** Response body for login/refresh — the refresh token itself travels only via HttpOnly cookie. */
export interface AuthSession {
  user: SafeUser;
  accessToken: string;
}
