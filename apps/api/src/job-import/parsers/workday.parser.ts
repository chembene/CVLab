import { Injectable } from '@nestjs/common';
import type { JobParser, ParsedJobResult } from '../interfaces/job-parser.interface';
import { parseJobHtml } from '../utils/job-html-parser.util';
import { deriveCompanyFromWorkdaySubdomain } from '../utils/job-field-heuristics.util';

/**
 * Workday-hosted career sites (`<company>.wd#.myworkdayjobs.com`). Same
 * shared JSON-LD/OG extraction, plus a fallback that reads the tenant
 * company name out of the subdomain — Workday's own stable tenant-URL
 * convention — when the page's structured data doesn't name the employer
 * (common on Workday, since many tenants only fully render job details via
 * client-side JS that a plain HTML fetch never executes).
 */
@Injectable()
export class WorkdayParser implements JobParser {
  readonly name = 'workday';

  canHandle(hostname: string): boolean {
    return hostname.includes('myworkdayjobs.com') || hostname.includes('workday.com');
  }

  parse(html: string, sourceUrl: string): ParsedJobResult {
    const result = parseJobHtml(html, sourceUrl);
    if (!result.data.company) {
      const company = deriveCompanyFromWorkdaySubdomain(sourceUrl);
      if (company) {
        result.data.company = company;
        result.confidence.company = 0.4;
      }
    }
    return result;
  }
}
