import { Injectable } from '@nestjs/common';
import type { JobParser, ParsedJobResult } from '../interfaces/job-parser.interface';
import { parseJobHtml } from '../utils/job-html-parser.util';

/**
 * Indeed job postings (indeed.com/viewjob, ...). Like LinkedIn, Indeed's
 * URLs carry only an opaque job key, so this parser relies entirely on the
 * shared JSON-LD/Open Graph extraction — Indeed emits JobPosting
 * structured data for Google for Jobs indexing.
 */
@Injectable()
export class IndeedParser implements JobParser {
  readonly name = 'indeed';

  canHandle(hostname: string): boolean {
    return hostname.includes('indeed.com');
  }

  parse(html: string, sourceUrl: string): ParsedJobResult {
    return parseJobHtml(html, sourceUrl);
  }
}
