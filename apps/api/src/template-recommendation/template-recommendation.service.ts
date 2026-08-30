import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { TemplateRecommendation } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { MasterResumeService } from '../master-resume/master-resume.service';
import { ResumeSectionsService } from '../resume-sections/resume-sections.service';
import { ResumeVariantService } from '../resume-variant/resume-variant.service';
import { JobTargetService } from '../job-target/job-target.service';
import { ResumeTemplateRepository } from '../template-engine/resume-template.repository';
import { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';
import type { TemplateRecommendationPromptInput } from './prompt/template-recommendation-prompt-builder';
import {
  TemplateRecommendationResponseParser,
  type ParsedTemplateRecommendationResponse,
} from './prompt/template-recommendation-response.parser';
import { TemplateRecommendationRepository } from './template-recommendation.repository';
import type { CreateTemplateRecommendationDto } from './dto/create-template-recommendation.dto';
import type {
  TemplateRecommendationContext,
  TemplateRecommendationContextSnapshot,
  TemplateRecommendationItem,
} from './interfaces/template-recommendation-context.interface';

/**
 * Orchestrates the Template Recommendation flow per
 * docs/architecture/template-recommendation-engine.md: best-effort context
 * gathering (every source optional, never invented) → AI Orchestration →
 * Prompt Builder → AI Provider → validate every returned templateId against
 * the REAL Template Engine catalog → persisted TemplateRecommendation row.
 * Never calls a provider or the credit ledger directly — every AI call goes
 * through AiOrchestrationService.execute(), the only thing allowed to touch
 * CreditService/AiRequestTrackingService. No parallel architecture: mirrors
 * CareerAdvisorService (FASE 18)/LinkedInService (FASE 19)/AtsAiService
 * (FASE 20) exactly. Never renders, creates, or mutates a ResumeTemplate —
 * that remains exclusively the Template Engine's (Phase 11) responsibility.
 */
@Injectable()
export class TemplateRecommendationService {
  constructor(
    private readonly repository: TemplateRecommendationRepository,
    private readonly masterResumeService: MasterResumeService,
    private readonly resumeSectionsService: ResumeSectionsService,
    private readonly resumeVariantService: ResumeVariantService,
    private readonly jobTargetService: JobTargetService,
    private readonly resumeTemplateRepository: ResumeTemplateRepository,
    private readonly aiOrchestrationService: AiOrchestrationService,
  ) {}

  async recommend(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: CreateTemplateRecommendationDto,
  ): Promise<TemplateRecommendation> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const resumeVariant = dto.resumeVariantId
      ? await this.resumeVariantService.getOne(requestingUser, targetUserId, dto.resumeVariantId)
      : null;
    const effectiveJobTargetId = dto.jobTargetId ?? resumeVariant?.jobTargetId ?? null;
    const jobTarget = effectiveJobTargetId
      ? await this.jobTargetService.getOne(requestingUser, targetUserId, effectiveJobTargetId)
      : null;

    const context = await this.buildContext(requestingUser, targetUserId, resumeVariant, jobTarget);
    const snapshot = this.buildContextSnapshot(context);
    const validTemplateIds = new Set(context.availableTemplates.map((t) => t.id));

    const promptInput: TemplateRecommendationPromptInput = { context };

    const result = await this.aiOrchestrationService.execute({
      userId: targetUserId,
      feature: AIFeature.TEMPLATE_RECOMMENDATION,
      input: promptInput,
      idempotencyKey: `template-recommendation:${targetUserId}:${randomUUID()}`,
      options: {
        responseFormat: 'json',
        responseValidator: (generateResult) => {
          const parsed = TemplateRecommendationResponseParser.parse(generateResult.text);
          this.validateTemplateIds(parsed, validTemplateIds);
        },
      },
    });

    const parsed = TemplateRecommendationResponseParser.parse(result.text);
    const validated = this.validateTemplateIds(parsed, validTemplateIds);

    return this.repository.create(targetUserId, {
      resumeVariantId: resumeVariant?.id,
      jobTargetId: jobTarget?.id,
      summary: parsed.summary,
      recommendations: validated,
      contextSnapshot: snapshot,
      creditsUsed: result.creditsCharged,
      aiRequestId: result.aiRequestId,
    });
  }

  async list(requestingUser: RequestUser, targetUserId: string): Promise<TemplateRecommendation[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.repository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<TemplateRecommendation> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const recommendation = await this.repository.findById(id);
    if (!recommendation || recommendation.userId !== targetUserId) {
      throw new NotFoundException('Template recommendation not found.');
    }
    return recommendation;
  }

  /**
   * The AI is never authoritative over which templates exist — every
   * templateId it returns is cross-checked here against the real Template
   * Engine catalog (already loaded into context, no second query). Invalid
   * ids are dropped, never persisted; the surviving items are re-ranked
   * 1..N ("rank deve ser determinístico após validação", per this phase's
   * brief) rather than trusting whatever rank the model assigned pre-filter.
   * Throws InvalidPromptError — the same error every other pipeline
   * failure throws — when NOTHING survives, so AiOrchestrationService's
   * existing automatic refund covers this case too, without a second
   * refund mechanism.
   */
  private validateTemplateIds(
    parsed: ParsedTemplateRecommendationResponse,
    validTemplateIds: Set<string>,
  ): TemplateRecommendationItem[] {
    const valid = parsed.templateRecommendations.filter((item) =>
      validTemplateIds.has(item.templateId),
    );
    if (valid.length === 0) {
      throw new InvalidPromptError('AI response referenced no existing template ids.');
    }
    return valid
      .sort((a, b) => a.rank - b.rank)
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }

  /**
   * Builds context entirely from data that already exists. Every source is
   * independently optional — a user with none of this data still gets a
   * valid, all-empty context, never a thrown error.
   * ResumeSectionsService.list() throws NotFoundException when no
   * MasterResume exists, so sections are only fetched when one does — same
   * gotcha as CareerAdvisorService/LinkedInService's buildContext().
   */
  private async buildContext(
    requestingUser: RequestUser,
    targetUserId: string,
    resumeVariant: Awaited<ReturnType<ResumeVariantService['getOne']>> | null,
    jobTarget: Awaited<ReturnType<JobTargetService['getOne']>> | null,
  ): Promise<TemplateRecommendationContext> {
    const [masterResume, availableTemplates] = await Promise.all([
      this.masterResumeService.getForUser(requestingUser, targetUserId),
      this.resumeTemplateRepository.findAll({}),
    ]);

    const [workExperience, education, skills, languages] = masterResume
      ? await Promise.all([
          this.resumeSectionsService.list('work-experience', requestingUser, targetUserId),
          this.resumeSectionsService.list('education', requestingUser, targetUserId),
          this.resumeSectionsService.list('skills', requestingUser, targetUserId),
          this.resumeSectionsService.list('languages', requestingUser, targetUserId),
        ])
      : [[], [], [], []];

    return {
      masterResume: masterResume
        ? {
            title: masterResume.title,
            summary: masterResume.summary,
            careerLevel: masterResume.careerLevel,
            yearsExperience: masterResume.yearsExperience,
            desiredPosition: masterResume.desiredPosition,
          }
        : null,
      workExperienceCount: workExperience.length,
      educationCount: education.length,
      skillsCount: skills.length,
      // SectionRecord's index signature is `unknown` — Language's own field
      // shape (prisma/schema.prisma) is stable and well known, same
      // trade-off CareerAdvisorService/LinkedInService already make.
      languages: languages.map((l) => l.language as string),
      resumeVariant: resumeVariant ? { title: resumeVariant.title } : null,
      jobTarget: jobTarget
        ? {
            title: jobTarget.title,
            company: jobTarget.company,
            seniority: jobTarget.seniority,
            employmentType: jobTarget.employmentType,
          }
        : null,
      availableTemplates: availableTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        isATSFriendly: t.isATSFriendly,
        premium: t.premium,
      })),
    };
  }

  private buildContextSnapshot(
    context: TemplateRecommendationContext,
  ): TemplateRecommendationContextSnapshot {
    return {
      hasMasterResume: context.masterResume !== null,
      hasResumeVariant: context.resumeVariant !== null,
      hasJobTarget: context.jobTarget !== null,
      workExperienceCount: context.workExperienceCount,
      educationCount: context.educationCount,
      skillsCount: context.skillsCount,
      availableTemplatesCount: context.availableTemplates.length,
    };
  }
}
