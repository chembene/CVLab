import { apiFetch, ApiError, setAccessToken } from './api-client';

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
});
