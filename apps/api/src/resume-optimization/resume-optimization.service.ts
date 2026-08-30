import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AtsReport, Prisma, ResumeVariant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeVariantService } from '../resume-variant/resume-variant.service';
import { ResumeVariantRepository } from '../resume-variant/resume-variant.repository';
import { calculateVariantCompletion } from '../resume-variant/resume-variant-completion.util';
import { JobTargetService } from '../job-target/job-target.service';
import { AtsAnalysisService } from '../ats/ats-analysis.service';
import { AtsReportRepository } from '../ats/ats-report.repository';
import { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import type { ResumeOptimizationPromptInput } from './resume-optimization-prompt-builder';
import { ResumeOptimizationResponseParser } from './resume-optimization-response.parser';
import { ResumeSuggestionApplier, type SuggestionToApply } from './resume-suggestion-applier';
import {
  ResumeOptimizationRepository,
  type OptimizationWithSuggestions,
} from './resume-optimization.repository';
import type { RunOptimizationDto } from './dto/run-optimization.dto';
import type { ApplySuggestionsDto } from './dto/apply-suggestions.dto';

type OptimizationEntityType = 'optimization' | 'suggestion';
type OptimizationAction = 'started' | 'completed' | 'failed' | 'applied' | 'deleted';

export interface ApplySuggestionsResult {
  optimization: OptimizationWithSuggestions;
  appliedSuggestionIds: string[];
  skippedSuggestionIds: string[];
  newAtsReport: AtsReport;
}

/**
 * Orchestrates the full Resume Optimization flow per
 * docs/architecture/resume-optimization.md: Resume Variant → ATS Report →
 * AI Orchestration → Prompt Builder → AI Provider → Suggestions → user
 * selection → Apply Engine → new ATS Report. Never calls a provider or the
 * credit ledger directly — every AI call goes through
 * AiOrchestrationService.execute() (which itself is the only thing allowed
 * to touch CreditService/AiRequestTrackingService), and every ATS score
 * comes from AtsAnalysisService, reused unchanged from Phase 4.
 */
@Injectable()
export class ResumeOptimizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ResumeOptimizationRepository,
    private readonly resumeVariantService: ResumeVariantService,
    private readonly resumeVariantRepository: ResumeVariantRepository,
    private readonly jobTargetService: JobTargetService,
    private readonly atsAnalysisService: AtsAnalysisService,
    private readonly atsReportRepository: AtsReportRepository,
    private readonly aiOrchestrationService: AiOrchestrationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async run(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: RunOptimizationDto,
  ): Promise<OptimizationWithSuggestions> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const variant = await this.resumeVariantService.getOne(
      requestingUser,
      targetUserId,
      dto.resumeVariantId,
    );
    if (!variant.jobTargetId) {
      throw new BadRequestException(
        'This resume variant has no linked job target to optimize against.',
      );
    }
    const jobTarget = await this.jobTargetService.getOne(
      requestingUser,
      targetUserId,
      variant.jobTargetId,
    );
    const beforeReport = await this.resolveBeforeReport(
      requestingUser,
      targetUserId,
      variant.id,
      dto.force,
    );

    // Auto-snapshot hook (Phase 10.5 Resume Version History, rule 8) —
    // "before Resume Optimization". Captures the resume state used as this
    // run's input, independent of whether suggestions are ever applied.
    // Failures are swallowed inside snapshotBeforeAiAction() itself — a
    // missed audit snapshot must never block optimization from running.
    await this.resumeVariantService.snapshotBeforeAiAction(
      requestingUser,
      targetUserId,
      variant.id,
      {
        label: 'CUSTOM',
        changeSummary: 'Snapshot before running resume optimization',
        jobTargetId: jobTarget.id,
      },
    );

    const pending = await this.repository.create(targetUserId, {
      resumeVariantId: variant.id,
      jobTargetId: jobTarget.id,
      atsReportId: beforeReport.id,
      beforeScore: beforeReport.overallScore,
    });
    this.emit(targetUserId, pending.id, 'started', 'optimization', { resumeVariantId: variant.id });

    try {
      const promptInput: ResumeOptimizationPromptInput = {
        resumeContent: (variant.content ?? {}) as Record<string, unknown>,
        jobTarget,
        atsReport: beforeReport,
      };

      const result = await this.aiOrchestrationService.execute({
        userId: targetUserId,
        feature: AIFeature.RESUME_OPTIMIZATION,
        input: promptInput,
        idempotencyKey: `resume-optimization:${pending.id}`,
        options: {
          responseFormat: 'json',
          // Runs inside AiOrchestrationService's own "Validate Response"
          // step — a thrown InvalidPromptError here gets the same automatic
          // refund + fail()-tracking as any other pipeline failure, entirely
          // without this service touching CreditService itself.
          responseValidator: (generateResult) => {
            ResumeOptimizationResponseParser.parse(generateResult.text);
          },
        },
      });

      const parsed = ResumeOptimizationResponseParser.parse(result.text);

      const completed = await this.repository.completeWithSuggestions(pending.id, {
        creditsUsed: result.creditsCharged,
        predictedScore: parsed.predictedScore,
        summary: parsed.summary,
        suggestions: parsed.suggestions.map((suggestion, index) => ({
          type: suggestion.type,
          section: suggestion.section,
          title: suggestion.title,
          reason: suggestion.reason,
          priority: suggestion.priority,
          originalText: suggestion.originalText,
          suggestedText: suggestion.suggestedText,
          displayOrder: index,
        })),
      });

      this.emit(targetUserId, completed.id, 'completed', 'optimization', {
        resumeVariantId: variant.id,
        predictedScore: parsed.predictedScore,
        suggestionCount: parsed.suggestions.length,
      });
      return completed;
    } catch (error) {
      await this.repository.markFailed(pending.id);
      this.emit(targetUserId, pending.id, 'failed', 'optimization', {
        resumeVariantId: variant.id,
        reason: error instanceof Error ? error.message : 'unknown error',
      });
      throw error;
    }
  }

  async list(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<OptimizationWithSuggestions[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.repository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<OptimizationWithSuggestions> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, id);
  }

  async apply(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: ApplySuggestionsDto,
  ): Promise<ApplySuggestionsResult> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const optimization = await this.findOwnedOrThrow(targetUserId, id);
    if (optimization.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Only a completed optimization has suggestions available to apply.',
      );
    }

    const requested = optimization.suggestions.filter((s) => dto.suggestionIds.includes(s.id));
    if (requested.length === 0) {
      throw new BadRequestException('None of the given suggestionIds belong to this optimization.');
    }
    const toApply = requested.filter((s) => !s.applied);
    if (toApply.length === 0) {
      throw new BadRequestException('All requested suggestions have already been applied.');
    }

    const variant = await this.resumeVariantService.getOne(
      requestingUser,
      targetUserId,
      optimization.resumeVariantId,
    );
    const applierInput: SuggestionToApply[] = toApply.map((s) => ({
      id: s.id,
      section: s.section,
      originalText: s.originalText,
      suggestedText: s.suggestedText,
    }));
    const { updatedContent, appliedSuggestionIds, skippedSuggestionIds } =
      ResumeSuggestionApplier.apply(
        (variant.content ?? {}) as Record<string, unknown>,
        applierInput,
      );
    const completionPercentage = calculateVariantCompletion(variant.title, updatedContent);

    let updatedVariant: ResumeVariant | undefined;
    await this.prisma.$transaction(async (tx) => {
      updatedVariant = await this.resumeVariantRepository.applyEdit(
        variant.id,
        { content: updatedContent as Prisma.InputJsonValue, completionPercentage },
        tx,
      );
      await this.repository.markApplyOutcome(tx, appliedSuggestionIds, skippedSuggestionIds);
    });

    // Auto-snapshot hook (Phase 10.5 Resume Version History, rule 8) — the
    // actual content-mutation point ("AI modifies Resume Variant" in the
    // brief's flow diagram). `updatedVariant` already carries the
    // post-edit `.version` from the transaction above, so this writes the
    // matching ResumeVariantVersion row directly rather than bumping the
    // version a second time — see recordAppliedContentVersion()'s comment.
    await this.resumeVariantService.recordAppliedContentVersion(
      requestingUser,
      targetUserId,
      updatedVariant!,
      updatedContent,
      { changeSummary: `Applied ${appliedSuggestionIds.length} optimization suggestion(s)` },
    );

    for (const suggestionId of appliedSuggestionIds) {
      this.emit(targetUserId, suggestionId, 'applied', 'suggestion', {
        optimizationId: optimization.id,
        resumeVariantId: variant.id,
      });
    }

    // "After applying suggestions, automatically execute ATS again, store
    // new score" — the new AtsReport row is where that new score lives.
    const newAtsReport = await this.atsAnalysisService.run(requestingUser, targetUserId, {
      resumeVariantId: variant.id,
    });

    const refreshed = await this.findOwnedOrThrow(targetUserId, id);
    return { optimization: refreshed, appliedSuggestionIds, skippedSuggestionIds, newAtsReport };
  }

  async remove(requestingUser: RequestUser, targetUserId: string, id: string): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    await this.repository.softDelete(id);
    this.emit(targetUserId, id, 'deleted', 'optimization');
  }

  /** Reuses the most recent existing ATS report for this variant unless `force` is set or none exists yet — see docs/architecture/resume-optimization.md "Choosing the before report". */
  private async resolveBeforeReport(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
    force?: boolean,
  ): Promise<AtsReport> {
    if (!force) {
      const existing = await this.atsReportRepository.findLatestByVariantId(variantId);
      if (existing) {
        return existing;
      }
    }
    return this.atsAnalysisService.run(requestingUser, targetUserId, {
      resumeVariantId: variantId,
    });
  }

  private async findOwnedOrThrow(
    targetUserId: string,
    id: string,
  ): Promise<OptimizationWithSuggestions> {
    const optimization = await this.repository.findById(id);
    if (!optimization || optimization.userId !== targetUserId) {
      throw new NotFoundException('Resume optimization not found.');
    }
    return optimization;
  }

  private emit(
    userId: string,
    entityId: string,
    action: OptimizationAction,
    entityType: OptimizationEntityType,
    metadata?: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, entityType, entityId, action, metadata),
    );
  }
}
