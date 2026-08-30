import { Injectable } from '@nestjs/common';
import type { JobParser, ParsedJobResult } from '../interfaces/job-parser.interface';
import { parseJobHtml } from '../utils/job-html-parser.util';
import { deriveCompanyFromFirstPathSegment } from '../utils/job-field-heuristics.util';

/**
 * Greenhouse job boards (boards.greenhouse.io, job-boards.greenhouse.io).
 * Relies on the same JSON-LD/OG extraction every parser shares — Greenhouse
 * emits JobPosting structured data for Google for Jobs indexing — and adds
 * one provider-specific fallback: Greenhouse board URLs are always shaped
 * `/<company-slug>/jobs/<id>` (a stable, documented Greenhouse URL
 * convention, not guessed-at DOM), which fills in `company` on the rare
 * page where JSON-LD/OG both omit it.
 */
@Injectable()
export class GreenhouseParser implements JobParser {
  readonly name = 'greenhouse';

  canHandle(hostname: string): boolean {
    return hostname.includes('greenhouse.io');
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
