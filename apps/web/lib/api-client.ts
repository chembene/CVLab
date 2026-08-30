import type { ApiResponse } from '@cvlab/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Single in-flight refresh even if several requests 401 at once — every caller awaits the same promise instead of firing N parallel refresh calls. */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        const body = (await response.json()) as ApiResponse<{ accessToken: string }>;
        if (body.success) {
          accessToken = body.data.accessToken;
          return accessToken;
        }
      } catch {
        // fall through to null below — treated as "not logged in"
      }
      accessToken = null;
      return null;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Thin fetch wrapper around the {success,data}/{success:false,error}
 * envelope (prompts/13-api-contracts.md §3). The access token lives only in
 * this in-memory module variable — never localStorage — per
 * docs/architecture/security-architecture.md §1.1; the refresh token is an
 * HttpOnly cookie the browser sends automatically via credentials:'include'.
 *
 * On a 401 (access token expired mid-session), transparently attempts one
 * silent refresh-and-retry via the httpOnly refresh cookie before giving up
 * — the "no automatic silent-refresh" limitation noted in earlier phases is
 * resolved here (Phase 10). `/auth/refresh` and `/auth/login` themselves are
 * never retried, to avoid an infinite loop.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  const body = (await response.json()) as ApiResponse<T>;

  if (!body.success) {
    const canRetry =
      response.status === 401 && !isRetry && path !== '/auth/refresh' && path !== '/auth/login';
    if (canRetry) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return apiFetch<T>(path, init, true);
      }
    }
    throw new ApiError(body.error.message, response.status, body.error.code);
  }

  return body.data;
}
