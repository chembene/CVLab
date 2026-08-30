import { BadRequestException } from '@nestjs/common';
import { JobFetcher } from './job-fetcher';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookup } = jest.requireMock('node:dns/promises') as { lookup: jest.Mock };

describe('JobFetcher', () => {
  let fetcher: JobFetcher;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetcher = new JobFetcher();
    fetchMock = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;
    lookup.mockReset();
  });

  function jsonResponse(status: number, body: string, headers: Record<string, string> = {}) {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: new TextEncoder().encode(body) };
            },
            cancel: async () => {},
          };
        },
      },
      text: async () => body,
    };
  }

  it('rejects non-http(s) URLs', async () => {
    await expect(fetcher.fetchHtml('ftp://example.com/file')).rejects.toThrow(BadRequestException);
  });

  it('rejects malformed URLs', async () => {
    await expect(fetcher.fetchHtml('not a url')).rejects.toThrow(BadRequestException);
  });

  it('rejects a hostname that resolves to a private IP (SSRF guard)', async () => {
    lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await expect(fetcher.fetchHtml('https://internal.example.com/')).rejects.toThrow(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects loopback addresses', async () => {
    lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(fetcher.fetchHtml('https://localhost.example.com/')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects link-local addresses (169.254.x.x, common SSRF/metadata-service target)', async () => {
    lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(fetcher.fetchHtml('https://metadata.example.com/')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects the literal hostname "localhost"', async () => {
    await expect(fetcher.fetchHtml('http://localhost/anything')).rejects.toThrow(
      BadRequestException,
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it('fetches a public URL successfully', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(jsonResponse(200, '<html>ok</html>'));

    const result = await fetcher.fetchHtml('https://example.com/jobs/1');
    expect(result.html).toBe('<html>ok</html>');
    expect(result.finalUrl).toBe('https://example.com/jobs/1');
  });

  it('follows a redirect and re-validates the new host', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(302, '', { location: 'https://example.com/final' }))
      .mockResolvedValueOnce(jsonResponse(200, '<html>final</html>'));

    const result = await fetcher.fetchHtml('https://example.com/start');
    expect(result.finalUrl).toBe('https://example.com/final');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a redirect chain that points to a private IP', async () => {
    lookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(302, '', { location: 'https://internal.example.com/' }),
    );

    await expect(fetcher.fetchHtml('https://example.com/start')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('gives up after too many redirects', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(jsonResponse(302, '', { location: 'https://example.com/next' }));

    await expect(fetcher.fetchHtml('https://example.com/start')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a response over the size cap', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const huge = 'x'.repeat(6 * 1024 * 1024);
    fetchMock.mockResolvedValue(jsonResponse(200, huge));

    await expect(fetcher.fetchHtml('https://example.com/big')).rejects.toThrow(BadRequestException);
  });

  it('surfaces non-2xx responses as a BadRequestException', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(jsonResponse(404, 'not found'));

    await expect(fetcher.fetchHtml('https://example.com/missing')).rejects.toThrow(
      BadRequestException,
    );
  });
});
