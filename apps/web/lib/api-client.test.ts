import { apiFetch, ApiError, setAccessToken, getAccessToken } from './api-client';

function mockFetchSequence(bodies: { body: unknown; status?: number }[]): jest.Mock {
  const mock = jest.fn();
  for (const { body, status = 200 } of bodies) {
    mock.mockResolvedValueOnce({ status, json: async () => body });
  }
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function mockFetchOnce(body: unknown, status = 200): jest.Mock {
  const mock = jest.fn().mockResolvedValue({
    status,
    json: async () => body,
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('apiFetch', () => {
  afterEach(() => {
    setAccessToken(null);
    jest.restoreAllMocks();
  });

  it('returns data on a successful envelope', async () => {
    mockFetchOnce({ success: true, data: { id: '1' } });
    const result = await apiFetch<{ id: string }>('/profile');
    expect(result).toEqual({ id: '1' });
  });

  it('throws ApiError with the server message on a failed envelope', async () => {
    mockFetchOnce(
      { success: false, error: { code: 'NOT_FOUND', message: 'Não encontrado.' } },
      404,
    );
    await expect(apiFetch('/profile')).rejects.toThrow(ApiError);
    await expect(apiFetch('/profile')).rejects.toThrow('Não encontrado.');
  });

  it('sends an Authorization header once an access token is set', async () => {
    const mock = mockFetchOnce({ success: true, data: null });
    setAccessToken('token-123');
    await apiFetch('/profile');
    const headers = mock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('omits the Authorization header when no access token is set', async () => {
    const mock = mockFetchOnce({ success: true, data: null });
    await apiFetch('/profile');
    const headers = mock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
  });

  it('sends credentials:include so the refresh cookie travels with every request', async () => {
    const mock = mockFetchOnce({ success: true, data: null });
    await apiFetch('/profile');
    expect(mock.mock.calls[0][1].credentials).toBe('include');
  });

  describe('401 refresh-and-retry', () => {
    it('silently refreshes the access token and retries once on a 401', async () => {
      const mock = mockFetchSequence([
        {
          body: { success: false, error: { code: 'UNAUTHORIZED', message: 'Token expired.' } },
          status: 401,
        },
        { body: { success: true, data: { accessToken: 'new-token' } } },
        { body: { success: true, data: { id: '1' } } },
      ]);

      const result = await apiFetch<{ id: string }>('/profile');

      expect(result).toEqual({ id: '1' });
      expect(mock).toHaveBeenCalledTimes(3);
      expect(mock.mock.calls[1]?.[0]).toContain('/auth/refresh');
      expect(mock.mock.calls[2]?.[0]).toContain('/profile');
      expect(getAccessToken()).toBe('new-token');
      // the retried request carries the freshly-refreshed token
      const retryHeaders = mock.mock.calls[2]?.[1].headers as Headers;
      expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');
    });

    it('throws the original 401 error when the refresh attempt itself fails', async () => {
      const mock = mockFetchSequence([
        {
          body: { success: false, error: { code: 'UNAUTHORIZED', message: 'Token expired.' } },
          status: 401,
        },
        {
          body: { success: false, error: { code: 'UNAUTHORIZED', message: 'No valid session.' } },
          status: 401,
        },
      ]);

      await expect(apiFetch('/profile')).rejects.toThrow('Token expired.');
      expect(mock).toHaveBeenCalledTimes(2); // one failed attempt + one failed refresh, no infinite loop
      expect(getAccessToken()).toBeNull();
    });

    it('never retries /auth/login on a 401 — that is a genuine bad-credentials response, not an expired session', async () => {
      const mock = mockFetchSequence([
        {
          body: {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid credentials.' },
          },
          status: 401,
        },
      ]);

      await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toThrow(
        'Invalid credentials.',
      );
      expect(mock).toHaveBeenCalledTimes(1); // no refresh attempt fired
    });
  });
});
