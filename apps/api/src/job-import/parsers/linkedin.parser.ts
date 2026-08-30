import { Injectable } from '@nestjs/common';
import type { JobParser, ParsedJobResult } from '../interfaces/job-parser.interface';
import { parseJobHtml } from '../utils/job-html-parser.util';

/**
 * LinkedIn job postings (linkedin.com/jobs/view/...). LinkedIn's own URL
 * structure carries only a numeric posting id, no company slug, so this
 * parser adds no path-derived fallback beyond the shared JSON-LD/Open
 * Graph extraction — LinkedIn's public job pages emit both for their own
 * SEO/share-preview purposes, which is what a plain (unauthenticated)
 * HTML fetch can actually see.
 */
@Injectable()
export class LinkedInParser implements JobParser {
  readonly name = 'linkedin';

  canHandle(hostname: string): boolean {
    return hostname.includes('linkedin.com');
  }

  parse(html: string, sourceUrl: string): ParsedJobResult {
    return parseJobHtml(html, sourceUrl);
  }
}
