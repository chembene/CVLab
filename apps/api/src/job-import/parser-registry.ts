import { Injectable } from '@nestjs/common';
import type { JobParser } from './interfaces/job-parser.interface';
import { GreenhouseParser } from './parsers/greenhouse.parser';
import { LeverParser } from './parsers/lever.parser';
import { WorkdayParser } from './parsers/workday.parser';
import { LinkedInParser } from './parsers/linkedin.parser';
import { IndeedParser } from './parsers/indeed.parser';
import { GenericHtmlParser } from './parsers/generic-html.parser';

/**
 * Selects a JobParser by hostname — the only place that knows every parser
 * exists. Each parser only knows its own hostname pattern and how to read
 * its own HTML (see interfaces/job-parser.interface.ts); this registry is
 * what "auto-select based on hostname" (rule 13) and "unsupported ATS
 * falls back to generic" (rule 11) actually mean in code: try each
 * registered parser's canHandle() in order, GenericHtmlParser last since
 * it always matches.
 */
@Injectable()
export class ParserRegistry {
  private readonly parsers: JobParser[];
  private readonly genericParser: GenericHtmlParser;

  constructor(
    greenhouse: GreenhouseParser,
    lever: LeverParser,
    workday: WorkdayParser,
    linkedin: LinkedInParser,
    indeed: IndeedParser,
    generic: GenericHtmlParser,
  ) {
    this.parsers = [greenhouse, lever, workday, linkedin, indeed, generic];
    this.genericParser = generic;
  }

  select(hostname: string): JobParser {
    const normalized = hostname.toLowerCase().replace(/^www\./, '');
    // GenericHtmlParser.canHandle() always returns true, so `find` never
    // actually falls through to genericParser below in practice — the
    // fallback only guards against a future registered parser breaking
    // that invariant.
    return this.parsers.find((parser) => parser.canHandle(normalized)) ?? this.genericParser;
  }
}
