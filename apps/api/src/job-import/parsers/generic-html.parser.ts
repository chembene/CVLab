import { Injectable } from '@nestjs/common';
import type { JobParser, ParsedJobResult } from '../interfaces/job-parser.interface';
import { parseJobHtml } from '../utils/job-html-parser.util';

/**
 * The catch-all for "unsupported ATS" (rule 11) and the last entry in
 * ParserRegistry — always `canHandle() === true`. Relies only on public
 * standards (JSON-LD JobPosting → Open Graph → bare HTML) via the shared
 * parseJobHtml() util, so it works reasonably on any career page, known
 * ATS or not.
 */
@Injectable()
export class GenericHtmlParser implements JobParser {
  readonly name = 'generic';

  canHandle(_hostname?: string): boolean {
    return true;
  }

  parse(html: string, sourceUrl = ''): ParsedJobResult {
    return parseJobHtml(html, sourceUrl);
  }
}
