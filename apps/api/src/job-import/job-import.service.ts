import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { JobTargetService } from '../job-target/job-target.service';
import type { JobTargetWithChildren } from '../job-target/job-target.repository';
import { JobFetcher } from './job-fetcher';
import { ParserRegistry } from './parser-registry';
import { JobImportRepository } from './job-import.repository';
import type { ImportJobDto } from './dto/import-job.dto';
import type { ParsedJobData, JobFieldConfidence } from './interfaces/job-parser.interface';

/** Below this overall confidence, the auto-created JobTarget is marked REQUIRES_REVIEW instead of READY (rule 10). */
export const JOB_IMPORT_CONFIDENCE_THRESHOLD = 0.6;

export interface JobImportResult {
  jobTarget: JobTargetWithChildren;
  overallConfidence: number;
  fieldConfidence: JobFieldConfidence;
  /** True when this import reused a prior extraction of the same URL instead of re-fetching (rule 13). */
  reusedExisting: boolean;
}

interface ExtractionOutcome {
  finalUrl: string;
  provider: string;
  rawHtml: string;
  data: ParsedJobData;
  confidence: JobFieldConfidence;
  overallConfidence: number;
  extractedAt: Date;
  duplicateOfId?: string;
}

/**
 * Orchestrates docs/architecture/job-import.md's flow: fetch → select
 * parser by hostname → parse → normalize → create JobTarget. Unlike CV
 * Import (which requires an explicit user confirm step), this phase's
 * brief says the JobTarget is created automatically — no preview/confirm
 * round trip — with low-confidence results flagged via
 * JobTargetStatus.REQUIRES_REVIEW instead of withheld.
 */
@Injectable()
export class JobImportService {
  constructor(
    private readonly fetcher: JobFetcher,
    private readonly registry: ParserRegistry,
    private readonly jobImportRepository: JobImportRepository,
    private readonly jobTargetService: JobTargetService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async importFromUrl(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: ImportJobDto,
  ): Promise<JobImportResult> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const outcome = await this.resolveExtraction(dto.url);
    const { data, confidence, overallConfidence } = outcome;

    // Defensive against a cached row (rule 13 reuse) written by an older
    // deploy whose ParsedJobData shape predates a field this version
    // expects — degrade gracefully instead of a 500 on import.
    const combinedSkills = dedupeCaseInsensitive([
      ...(data.skills ?? []),
      ...(data.technologies ?? []),
    ]);

    const jobTarget = await this.jobTargetService.create(requestingUser, targetUserId, {
      title: (data.title ?? 'Untitled Position').slice(0, 200),
      company: data.company?.slice(0, 150),
      location: data.location?.slice(0, 150),
      employmentType: data.employmentType?.slice(0, 50),
      seniority: data.seniority?.slice(0, 50),
      salaryMin: data.salaryMin,
      salaryMax: data.salaryMax,
      currency: data.currency?.slice(0, 3),
      jobUrl: outcome.finalUrl,
      jobDescription: buildFullDescription(data).slice(0, 20000),
      source: outcome.provider,
      status: overallConfidence < JOB_IMPORT_CONFIDENCE_THRESHOLD ? 'REQUIRES_REVIEW' : 'READY',
      // JobTarget has no dedicated "technologies" child table — skills and
      // technologies (rules 2 & 3) are stored as two distinct arrays in
      // JobImportMetadata.extractedData for the frontend to render as
      // separate chip lists, but collapse into one JobTargetSkill
      // collection here, the only structured slot the existing schema
      // offers (see docs/architecture/job-import.md).
      skills: combinedSkills.map((skill) => ({ skill, required: false })),
      languages: (data.languages ?? []).map((language) => ({ language })),
    });

    await this.jobImportRepository.create({
      jobTargetId: jobTarget.id,
      sourceUrl: outcome.finalUrl,
      provider: outcome.provider,
      rawHtml: outcome.rawHtml,
      cleanedDescription: data.description,
      companyLogoUrl: data.companyLogoUrl,
      extractedData: data,
      fieldConfidence: confidence,
      overallConfidence,
      extractedAt: outcome.extractedAt,
      duplicateOfId: outcome.duplicateOfId,
    });

    this.emit(targetUserId, jobTarget.id, overallConfidence < JOB_IMPORT_CONFIDENCE_THRESHOLD);

    return {
      jobTarget,
      overallConfidence,
      fieldConfidence: confidence,
      reusedExisting: Boolean(outcome.duplicateOfId),
    };
  }

  /** Read-only helper for the frontend's import-preview screen — the raw extraction audit row behind an already-created JobTarget. */
  async getImportMetadata(requestingUser: RequestUser, targetUserId: string, jobTargetId: string) {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.jobTargetService.assertOwnedJobTarget(requestingUser, targetUserId, jobTargetId);
    return this.jobImportRepository.findByJobTargetId(jobTargetId);
  }

  /**
   * Rule 13, "duplicate detection": if a prior import already fetched and
   * parsed this exact URL (matched against the stored, post-redirect
   * `sourceUrl`), reuse its extraction rather than hitting the network and
   * re-parsing. `extractedAt` is carried over from the original row so the
   * audit trail keeps reporting when the data was actually extracted, not
   * when it was last reused.
   */
  private async resolveExtraction(inputUrl: string): Promise<ExtractionOutcome> {
    const cached = await this.jobImportRepository.findLatestBySourceUrl(inputUrl);
    if (cached) {
      return {
        finalUrl: cached.sourceUrl,
        provider: cached.provider,
        rawHtml: cached.rawHtml,
        data: cached.extractedData as unknown as ParsedJobData,
        confidence: cached.fieldConfidence as unknown as JobFieldConfidence,
        overallConfidence: cached.overallConfidence,
        extractedAt: cached.extractedAt,
        duplicateOfId: cached.id,
      };
    }

    const { html, finalUrl } = await this.fetcher.fetchHtml(inputUrl);
    const hostname = new URL(finalUrl).hostname;
    const parser = this.registry.select(hostname);
    const { data, confidence } = parser.parse(html, finalUrl);
    const overallConfidence = computeOverallConfidence(confidence);

    return {
      finalUrl,
      provider: parser.name,
      rawHtml: html,
      data,
      confidence,
      overallConfidence,
      extractedAt: new Date(),
    };
  }

  private emit(userId: string, jobTargetId: string, requiresReview: boolean): void {
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, 'job_target', jobTargetId, 'imported', {
        requiresReview,
      }),
    );
  }
}

function computeOverallConfidence(confidence: JobFieldConfidence): number {
  const values = Object.values(confidence).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function buildFullDescription(data: ParsedJobData): string {
  const sections: string[] = [data.description];
  const responsibilities = data.responsibilities ?? [];
  const requirements = data.requirements ?? [];
  const niceToHave = data.niceToHave ?? [];
  const benefits = data.benefits ?? [];
  if (responsibilities.length > 0) {
    sections.push(['Responsibilities:', ...responsibilities.map((r) => `- ${r}`)].join('\n'));
  }
  if (requirements.length > 0) {
    sections.push(['Requirements:', ...requirements.map((r) => `- ${r}`)].join('\n'));
  }
  if (niceToHave.length > 0) {
    sections.push(['Nice to have:', ...niceToHave.map((r) => `- ${r}`)].join('\n'));
  }
  if (benefits.length > 0) {
    sections.push(['Benefits:', ...benefits.map((r) => `- ${r}`)].join('\n'));
  }
  return sections.join('\n\n');
}
