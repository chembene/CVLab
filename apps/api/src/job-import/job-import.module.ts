import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { JobImportController } from './job-import.controller';
import { JobImportService } from './job-import.service';
import { JobImportRepository } from './job-import.repository';
import { JobFetcher } from './job-fetcher';
import { ParserRegistry } from './parser-registry';
import { GreenhouseParser } from './parsers/greenhouse.parser';
import { LeverParser } from './parsers/lever.parser';
import { WorkdayParser } from './parsers/workday.parser';
import { LinkedInParser } from './parsers/linkedin.parser';
import { IndeedParser } from './parsers/indeed.parser';
import { GenericHtmlParser } from './parsers/generic-html.parser';

/**
 * The Job Import Engine (Phase 10.5) — see docs/architecture/job-import.md.
 * Reuses JobTargetModule's exported JobTargetService to actually create the
 * JobTarget (never duplicates its CRUD/child-collection logic), same
 * composition pattern as every other feature module in this codebase.
 */
@Module({
  imports: [AuthModule, JobTargetModule],
  controllers: [JobImportController],
  providers: [
    JobImportRepository,
    JobImportService,
    JobFetcher,
    ParserRegistry,
    GreenhouseParser,
    LeverParser,
    WorkdayParser,
    LinkedInParser,
    IndeedParser,
    GenericHtmlParser,
  ],
  exports: [JobImportService],
})
export class JobImportModule {}
