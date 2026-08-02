import type { ApiResponse } from '@cvlab/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin fetch wrapper around the {success,data}/{success:false,error}
 * envelope (prompts/13-api-contracts.md §3). The access token lives only in
 * this in-memory module variable — never localStorage — per
 * docs/architecture/security-architecture.md §1.1; the refresh token is an
 * HttpOnly cookie the browser sends automatically via credentials:'include'.
 *
 * Known limitation (Phase 2A scope): no automatic silent-refresh-and-retry
 * when an access token expires mid-session (15 min) — see README.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw new ApiError(body.error.message, response.status);
  }

  return body.data;
}
