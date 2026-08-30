import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AtsReport } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeVariantService } from '../resume-variant/resume-variant.service';
import { JobTargetService } from '../job-target/job-target.service';
import { AtsReportRepository } from './ats-report.repository';
import { buildSearchableText, extractNames, sectionCount } from './ats-content.util';
import {
  calculateOverallScore,
  compareKeywords,
  compareLanguages,
  compareSkills,
  detectEmptySections,
  detectFormattingProblems,
  generateRecommendations,
  inferMinYearsFromSeniority,
  scoreEducation,
  scoreExperience,
  scoreFormatting,
} from './ats-scoring.util';
import type { RunAtsAnalysisDto } from './dto/run-ats-analysis.dto';

/**
 * Orchestrates the deterministic ATS comparison: fetch the Resume Variant
 * and its linked Job Target (both ownership-checked via their own
 * services), run every pure scoring function from ats-scoring.util.ts, and
 * persist one new AtsReport row. No AI, no external calls — every input is
 * already in Postgres.
 */
@Injectable()
export class AtsAnalysisService {
  constructor(
    private readonly atsReportRepository: AtsReportRepository,
    private readonly resumeVariantService: ResumeVariantService,
    private readonly jobTargetService: JobTargetService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async run(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: RunAtsAnalysisDto,
  ): Promise<AtsReport> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const variant = await this.resumeVariantService.getOne(
      requestingUser,
      targetUserId,
      dto.resumeVariantId,
    );
    if (!variant.jobTargetId) {
      throw new BadRequestException(
        'This resume variant has no linked job target to compare against.',
      );
    }
    const jobTarget = await this.jobTargetService.getOne(
      requestingUser,
      targetUserId,
      variant.jobTargetId,
    );

    // Auto-snapshot hook (Phase 10.5 Resume Version History, rule 8) —
    // "before ATS rewrite". AtsAnalysisService itself is deterministic and
    // never mutates the Resume Variant's content, but it's still one of the
    // brief's 4 named integration points — this captures the exact resume
    // state an ATS score was computed against, for audit/traceability.
    // Failures are swallowed inside snapshotBeforeAiAction() itself.
    await this.resumeVariantService.snapshotBeforeAiAction(
      requestingUser,
      targetUserId,
      variant.id,
      {
        label: 'CUSTOM',
        changeSummary: 'Snapshot before running ATS analysis',
        jobTargetId: jobTarget.id,
      },
    );

    const content = (variant.content ?? {}) as Record<string, unknown>;
    const searchableText = buildSearchableText(content);
    const resumeSkillNames = extractNames(content.skills, 'name');
    const resumeLanguageNames = extractNames(content.languages, 'language');

    const keywordResult = compareKeywords(
      jobTarget.keywords.map((k) => k.keyword),
      searchableText,
    );
    const skillsResult = compareSkills(
      jobTarget.skills.map((s) => ({ skill: s.skill, required: s.required })),
      resumeSkillNames,
    );
    const educationScore = scoreEducation(content);
    const languageScore = compareLanguages(
      jobTarget.languages.map((l) => ({ language: l.language })),
      resumeLanguageNames,
    );

    const minYears = inferMinYearsFromSeniority(jobTarget.seniority);
    const actualYears = typeof content.yearsExperience === 'number' ? content.yearsExperience : 0;
    const experienceScore = scoreExperience(
      minYears,
      actualYears,
      sectionCount(content.workExperiences),
    );

    const formattingIssues = detectFormattingProblems(content);
    const formattingScore = scoreFormatting(formattingIssues);
    const completionScore = variant.completionPercentage;
    const emptySections = detectEmptySections(content);

    const overallScore = calculateOverallScore({
      keywordScore: keywordResult.score,
      skillsScore: skillsResult.score,
      experienceScore,
      educationScore,
      languageScore,
      formattingScore,
      completionScore,
    });

    const recommendations = generateRecommendations({
      missingKeywords: keywordResult.missing,
      missingSkills: skillsResult.missingSkills,
      formattingIssues,
      emptySections,
      experienceScore,
    });

    const report = await this.atsReportRepository.create(targetUserId, variant.id, jobTarget.id, {
      overallScore,
      keywordScore: keywordResult.score,
      skillsScore: skillsResult.score,
      experienceScore,
      educationScore,
      languageScore,
      formattingScore,
      completionScore,
      matchedKeywords: keywordResult.matched,
      missingKeywords: keywordResult.missing,
      recommendedSkills: skillsResult.missingSkills,
      recommendations,
    });

    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(targetUserId, 'ats_report', report.id, 'created'),
    );
    return report;
  }

  async list(requestingUser: RequestUser, targetUserId: string): Promise<AtsReport[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.atsReportRepository.findAllByUserId(targetUserId);
  }

  async getOne(requestingUser: RequestUser, targetUserId: string, id: string): Promise<AtsReport> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, id);
  }

  async remove(requestingUser: RequestUser, targetUserId: string, id: string): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    await this.atsReportRepository.delete(id);
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(targetUserId, 'ats_report', id, 'deleted'),
    );
  }

  private async findOwnedOrThrow(targetUserId: string, id: string): Promise<AtsReport> {
    const report = await this.atsReportRepository.findById(id);
    if (!report || report.userId !== targetUserId) {
      throw new NotFoundException('ATS report not found.');
    }
    return report;
  }
}
