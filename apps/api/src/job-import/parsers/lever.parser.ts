import { Injectable } from '@nestjs/common';
import type { JobParser, ParsedJobResult } from '../interfaces/job-parser.interface';
import { parseJobHtml } from '../utils/job-html-parser.util';
import { deriveCompanyFromFirstPathSegment } from '../utils/job-field-heuristics.util';

/**
 * Lever job boards (jobs.lever.co). Same shared JSON-LD/OG extraction as
 * every other parser, plus a fallback to Lever's own stable URL
 * convention (`/<company-slug>/<posting-id>`) when neither structured
 * source names the company.
 */
@Injectable()
export class LeverParser implements JobParser {
  readonly name = 'lever';

  canHandle(hostname: string): boolean {
    return hostname.includes('lever.co');
  }

  parse(html: string, sourceUrl: string): ParsedJobResult {
    const result = parseJobHtml(html, sourceUrl);
    if (!result.data.company) {
      const company = deriveCompanyFromFirstPathSegment(sourceUrl);
      if (company) {
        result.data.company = company;
        result.confidence.company = 0.4;
      }
    }
    return result;
  }
}
