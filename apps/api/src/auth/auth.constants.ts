/** Name of the HttpOnly cookie carrying the opaque refresh token. */
export const REFRESH_COOKIE_NAME = 'refresh_token';

/** Path scope for the refresh cookie — only endpoints that need to read it. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** bcrypt cost factor. Server-side only, never client-configurable. */
export const BCRYPT_SALT_ROUNDS = 12;

/** Verification/reset token lifetimes. */
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
