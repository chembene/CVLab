import { Injectable, BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';

const USER_AGENT = 'CVLabAI-JobImportBot/1.0 (+https://cvlab.ai)';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export interface FetchedPage {
  html: string;
  finalUrl: string;
}

/**
 * SSRF-safe HTML fetcher for the Job Import Engine — the one place that
 * touches the network on the user's behalf. Validates scheme, resolves and
 * rejects private/loopback/link-local targets (including on every redirect
 * hop, not just the initial URL), bounds redirects, and caps response size.
 * Parsers never fetch anything themselves; JobImportService is the only
 * caller.
 */
@Injectable()
export class JobFetcher {
  async fetchHtml(inputUrl: string): Promise<FetchedPage> {
    let currentUrl = this.parseAndValidateUrl(inputUrl);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await this.assertPublicHostname(currentUrl.hostname);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(currentUrl.toString(), {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
        });
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error && error.name === 'AbortError'
            ? 'Timed out fetching the job URL.'
            : 'Could not reach the job URL.',
        );
      } finally {
        clearTimeout(timeout);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new BadRequestException('The job URL redirected without a Location header.');
        }
        currentUrl = this.parseAndValidateUrl(new URL(location, currentUrl).toString());
        continue;
      }

      if (!response.ok) {
        throw new BadRequestException(
          `Fetching the job URL failed with status ${response.status}.`,
        );
      }

      const html = await this.readBodyWithLimit(response);
      return { html, finalUrl: currentUrl.toString() };
    }

    throw new BadRequestException('The job URL redirected too many times.');
  }

  private parseAndValidateUrl(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('That is not a valid URL.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('Only http/https job URLs are supported.');
    }
    return url;
  }

  private async assertPublicHostname(hostname: string): Promise<void> {
    if (isDisallowedHostname(hostname)) {
      throw new BadRequestException('That URL points to a disallowed host.');
    }
    let addresses: { address: string; family: number }[];
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new BadRequestException("Could not resolve the job URL's host.");
    }
    for (const { address, family } of addresses) {
      const isPrivate = family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
      if (isPrivate) {
        throw new BadRequestException(
          'That URL resolves to a private/internal address, which is not allowed.',
        );
      }
    }
  }

  private async readBodyWithLimit(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      return response.text();
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new BadRequestException('The job page is too large to import.');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
  }
}

function isDisallowedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === 'localhost' || lower.endsWith('.localhost') || lower === '0.0.0.0';
}

function isPrivateIPv4(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o))) return true;
  const [a, b] = octets as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique local
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const mappedIpv4 = mapped?.[1];
  if (mappedIpv4) return isPrivateIPv4(mappedIpv4);
  return false;
}
