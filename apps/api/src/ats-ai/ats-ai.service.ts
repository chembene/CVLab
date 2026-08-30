import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { AtsAiAnalysis } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { AtsAnalysisService } from '../ats/ats-analysis.service';
import { ResumeVariantService } from '../resume-variant/resume-variant.service';
import { JobTargetService } from '../job-target/job-target.service';
import { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import type { AtsAiPromptInput } from './prompt/ats-ai-prompt-builder';
import { AtsAiResponseParser } from './prompt/ats-ai-response.parser';
import { AtsAiRepository } from './ats-ai.repository';
import type { CreateAtsAiAnalysisDto } from './dto/create-ats-ai-analysis.dto';
import type { AtsAiContext, AtsAiContextSnapshot } from './interfaces/ats-ai-context.interface';

/**
 * Orchestrates the ATS AI flow per docs/architecture/ats-ai-engine.md: load
 * an already-computed, deterministic AtsReport (Phase 4 — never
 * recalculated here) + its already-linked Resume Variant/Job Target →
 * AI Orchestration → Prompt Builder → AI Provider → persisted
 * AtsAiAnalysis row. Never calls a provider or the credit ledger directly —
 * every AI call goes through AiOrchestrationService.execute(), the only
 * thing allowed to touch CreditService/AiRequestTrackingService. No
 * parallel architecture: mirrors CareerAdvisorService (FASE 18)/
 * LinkedInService (FASE 19) exactly. No keyword matching, scoring, or
 * formatting/section detection is duplicated — every number/list in the
 * context comes straight from the already-persisted AtsReport row.
 */
@Injectable()
export class AtsAiService {
  constructor(
    private readonly repository: AtsAiRepository,
    private readonly atsAnalysisService: AtsAnalysisService,
    private readonly resumeVariantService: ResumeVariantService,
    private readonly jobTargetService: JobTargetService,
    private readonly aiOrchestrationService: AiOrchestrationService,
  ) {}

  async analyze(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: CreateAtsAiAnalysisDto,
  ): Promise<AtsAiAnalysis> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    // Ownership-checked read of the already-computed report — 404 (not the
    // report's own userId check) if it belongs to another user, same
    // IDOR-safe pattern as every other feature.
    const report = await this.atsAnalysisService.getOne(
      requestingUser,
      targetUserId,
      dto.atsReportId,
    );

    const context = await this.buildContext(requestingUser, targetUserId, report);
    const snapshot = this.buildContextSnapshot(context);

    const promptInput: AtsAiPromptInput = { context };

    const result = await this.aiOrchestrationService.execute({
      userId: targetUserId,
      feature: AIFeature.ATS_AI,
      input: promptInput,
      idempotencyKey: `ats-ai:${targetUserId}:${randomUUID()}`,
      options: {
        responseFormat: 'json',
        responseValidator: (generateResult) => {
          AtsAiResponseParser.parse(generateResult.text);
        },
      },
    });

    const parsed = AtsAiResponseParser.parse(result.text);

    return this.repository.create(targetUserId, {
      atsReportId: report.id,
      overallAssessment: parsed.overallAssessment,
      strengths: parsed.strengths,
      priorityIssues: parsed.priorityIssues,
      contentRecommendations: parsed.contentRecommendations,
      sectionRecommendations: parsed.sectionRecommendations,
      actionPlan: parsed.actionPlan,
      contextSnapshot: snapshot,
      creditsUsed: result.creditsCharged,
      aiRequestId: result.aiRequestId,
    });
  }

  async list(requestingUser: RequestUser, targetUserId: string): Promise<AtsAiAnalysis[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.repository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<AtsAiAnalysis> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const analysis = await this.repository.findById(id);
    if (!analysis || analysis.userId !== targetUserId) {
      throw new NotFoundException('ATS AI analysis not found.');
    }
    return analysis;
  }

  /**
   * Builds context entirely from data that already exists: the AtsReport's
   * own persisted fields (never recalculated), plus its already-linked
   * Resume Variant and Job Target — both guaranteed to exist and belong to
   * the same user, since AtsReport.resumeVariantId/jobTargetId are
   * non-nullable FKs set at report-creation time (see
   * AtsAnalysisService.run()). Unlike CareerAdvisorService/LinkedInService,
   * there is no "optional/absent" branch here — a report can't exist
   * without both.
   */
  private async buildContext(
    requestingUser: RequestUser,
    targetUserId: string,
    report: Awaited<ReturnType<AtsAnalysisService['getOne']>>,
  ): Promise<AtsAiContext> {
    const [variant, jobTarget] = await Promise.all([
      this.resumeVariantService.getOne(requestingUser, targetUserId, report.resumeVariantId),
      this.jobTargetService.getOne(requestingUser, targetUserId, report.jobTargetId),
    ]);

    return {
      atsReport: {
        overallScore: report.overallScore,
        keywordScore: report.keywordScore,
        skillsScore: report.skillsScore,
        experienceScore: report.experienceScore,
        educationScore: report.educationScore,
        languageScore: report.languageScore,
        formattingScore: report.formattingScore,
        completionScore: report.completionScore,
        matchedKeywords: report.matchedKeywords,
        missingKeywords: report.missingKeywords,
        recommendedSkills: report.recommendedSkills,
        recommendations: report.recommendations,
      },
      jobTarget: {
        title: jobTarget.title,
        company: jobTarget.company,
        seniority: jobTarget.seniority,
        keywords: jobTarget.keywords.map((k) => k.keyword),
        skills: jobTarget.skills.map((s) => s.skill),
        languages: jobTarget.languages.map((l) => l.language),
      },
      resume: { title: variant.title },
    };
  }

  private buildContextSnapshot(context: AtsAiContext): AtsAiContextSnapshot {
    return {
      matchedKeywordsCount: context.atsReport.matchedKeywords.length,
      missingKeywordsCount: context.atsReport.missingKeywords.length,
      recommendedSkillsCount: context.atsReport.recommendedSkills.length,
    };
  }
}
