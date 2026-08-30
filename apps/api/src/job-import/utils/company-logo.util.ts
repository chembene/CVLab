import type { JsonLdJobPosting, OpenGraphData } from './structured-data.util';
import { extractFaviconUrl } from './structured-data.util';

/**
 * Resolves a company logo URL without any extra network fetch (staying
 * inside JobFetcher's single SSRF-guarded request per import) — rule 1's
 * exact priority order:
 *
 * 1. Open Graph image (`og:image`) — the page's own social-preview image,
 *    which for a job posting is very often the actual role/company banner.
 * 2. "Company favicon" — Google's public favicon service
 *    (`google.com/s2/favicons`, a real, widely-used technique, not a
 *    guessed-at endpoint) resolved against the *company's own* domain —
 *    derived from schema.org `hiringOrganization.url`/`sameAs` — distinct
 *    from the job board's own domain.
 * 3. "Organization schema" — schema.org `hiringOrganization.logo` itself.
 * 4. "Website favicon" — the current page's own `<link rel="icon">`, or,
 *    failing that, the favicon service against the page's own hostname.
 */
export function resolveCompanyLogoUrl(params: {
  og: OpenGraphData;
  jsonLd: JsonLdJobPosting | undefined;
  html: string;
  sourceUrl: string;
}): string | undefined {
  const { og, jsonLd, html, sourceUrl } = params;

  if (og.image) {
    return resolveAbsolute(og.image, sourceUrl);
  }

  const companyDomain = jsonLd?.companyWebsite ? hostnameOf(jsonLd.companyWebsite) : undefined;
  if (companyDomain) {
    return googleFaviconUrl(companyDomain);
  }

  if (jsonLd?.companyLogoUrl) {
    return resolveAbsolute(jsonLd.companyLogoUrl, sourceUrl);
  }

  const pageFavicon = extractFaviconUrl(html, sourceUrl);
  if (pageFavicon) {
    return pageFavicon;
  }

  const pageDomain = hostnameOf(sourceUrl);
  return pageDomain ? googleFaviconUrl(pageDomain) : undefined;
}

function googleFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function resolveAbsolute(url: string, baseUrl: string): string | undefined {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return undefined;
  }
}
