import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type { AtsReport, CoverLetter, CoverLetterTone, ResumeVariant } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeVariantService } from '../resume-variant/resume-variant.service';
import { JobTargetService } from '../job-target/job-target.service';
import type { JobTargetWithChildren } from '../job-target/job-target.repository';
import { AtsAnalysisService } from '../ats/ats-analysis.service';
import { AtsReportRepository } from '../ats/ats-report.repository';
import { ResumeOptimizationService } from '../resume-optimization/resume-optimization.service';
import { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import type { CoverLetterPromptInput } from './cover-letter-prompt-builder';
import { CoverLetterResponseParser } from './cover-letter-response.parser';
import { CoverLetterRepository } from './cover-letter.repository';
import type { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';
import type { UpdateCoverLetterDto } from './dto/update-cover-letter.dto';
import { CoverLetterTemplateRepository } from '../template-engine/cover-letter-template.repository';
import type { ThemeOverridesDto } from '../template-engine/dto/theme-overrides.dto';

type CoverLetterAction = 'generated' | 'updated' | 'created' | 'archived' | 'restored' | 'deleted';

interface GenerationParams {
  variant: ResumeVariant;
  jobTarget: JobTargetWithChildren;
  atsReport: AtsReport;
  optimizationId?: string;
  optimizationSummary: string | null;
  tone: CoverLetterTone;
  language: string;
  version: number;
}

/**
 * Orchestrates the Cover Letter flow per docs/architecture/cover-letter-engine.md:
 * Resume Variant → Job Target → ATS Report → (optional) Resume Optimization
 * summary → AI Orchestration → Prompt Builder → AI Provider → persisted
 * CoverLetter row. Never calls a provider or the credit ledger directly —
 * every AI call goes through AiOrchestrationService.execute(), the only
 * thing allowed to touch CreditService/AiRequestTrackingService. Every ATS
 * score comes from AtsAnalysisService, reused unchanged from Phase 4.
 */
@Injectable()
export class CoverLetterService {
  constructor(
    private readonly repository: CoverLetterRepository,
    private readonly resumeVariantService: ResumeVariantService,
    private readonly jobTargetService: JobTargetService,
    private readonly atsAnalysisService: AtsAnalysisService,
    private readonly atsReportRepository: AtsReportRepository,
    private readonly resumeOptimizationService: ResumeOptimizationService,
    private readonly aiOrchestrationService: AiOrchestrationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly templateRepository: CoverLetterTemplateRepository,
  ) {}

  async generate(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: GenerateCoverLetterDto,
  ): Promise<CoverLetter> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const variant = await this.resumeVariantService.getOne(
      requestingUser,
      targetUserId,
      dto.resumeVariantId,
    );
    if (!variant.jobTargetId) {
      throw new BadRequestException(
        'This resume variant has no linked job target to write a cover letter for.',
      );
    }
    const jobTarget = await this.jobTargetService.getOne(
      requestingUser,
      targetUserId,
      variant.jobTargetId,
    );
    const atsReport = await this.resolveAtsReport(requestingUser, targetUserId, variant.id);
    const optimizationSummary = await this.resolveOptimizationSummary(
      requestingUser,
      targetUserId,
      dto.optimizationId,
    );

    // Auto-snapshot hook (Phase 10.5 Resume Version History, rule 8) —
    // "before Cover Letter generation". Failures are swallowed inside
    // snapshotBeforeAiAction() itself — a missed audit snapshot must never
    // block generation.
    await this.resumeVariantService.snapshotBeforeAiAction(
      requestingUser,
      targetUserId,
      variant.id,
      {
        label: 'CUSTOM',
        changeSummary: 'Snapshot before generating a cover letter',
        jobTargetId: jobTarget.id,
      },
    );

    return this.runGeneration(targetUserId, {
      variant,
      jobTarget,
      atsReport,
      optimizationId: dto.optimizationId,
      optimizationSummary,
      tone: dto.tone,
      language: dto.language,
      version: 1,
    });
  }

  /** "Generate a new version while preserving the previous one. Increment version." — creates a brand-new row; the source row is never modified. */
  async regenerate(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<CoverLetter> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const source = await this.findOwnedOrThrow(targetUserId, id);

    const variant = await this.resumeVariantService.getOne(
      requestingUser,
      targetUserId,
      source.resumeVariantId,
    );
    const jobTarget = await this.jobTargetService.getOne(
      requestingUser,
      targetUserId,
      source.jobTargetId,
    );
    const atsReport = await this.resolveAtsReport(requestingUser, targetUserId, variant.id);
    const optimizationSummary = await this.resolveOptimizationSummary(
      requestingUser,
      targetUserId,
      source.optimizationId ?? undefined,
    );

    // Auto-snapshot hook (Phase 10.5 Resume Version History, rule 8) — same
    // "before Cover Letter generation" point as generate().
    await this.resumeVariantService.snapshotBeforeAiAction(
      requestingUser,
      targetUserId,
      variant.id,
      {
        label: 'CUSTOM',
        changeSummary: 'Snapshot before regenerating a cover letter',
        jobTargetId: jobTarget.id,
      },
    );

    return this.runGeneration(targetUserId, {
      variant,
      jobTarget,
      atsReport,
      optimizationId: source.optimizationId ?? undefined,
      optimizationSummary,
      tone: source.tone,
      language: source.language,
      version: source.version + 1,
    });
  }

  async list(requestingUser: RequestUser, targetUserId: string): Promise<CoverLetter[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.repository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<CoverLetter> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, id);
  }

  /** Manual editing — never bumps `version`, never touches credits or AI. */
  async update(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: UpdateCoverLetterDto,
  ): Promise<CoverLetter> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    const updated = await this.repository.update(id, {
      title: dto.title,
      content: dto.content,
      tone: dto.tone,
      language: dto.language,
      status: 'EDITED',
    });
    this.emit(targetUserId, id, 'updated');
    return updated;
  }

  /** Phase 11 Template Engine, Part 13 — same rationale as ResumeVariantService.setTemplate(). */
  async setTemplate(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    templateId: string,
  ): Promise<CoverLetter> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);
    const template = await this.templateRepository.findById(templateId);
    if (!template) {
      throw new NotFoundException('Modelo de carta de apresentação não encontrado.');
    }

    const updated = await this.repository.update(id, { templateId });
    this.emit(targetUserId, id, 'updated');
    return updated;
  }

  /** Part 6 "Theme Customization" — same wholesale-replace rationale as ResumeVariantService.updateTheme(). */
  async updateTheme(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    themeOverrides: ThemeOverridesDto,
  ): Promise<CoverLetter> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    const updated = await this.repository.update(id, {
      themeOverrides: themeOverrides as Prisma.InputJsonValue,
    });
    this.emit(targetUserId, id, 'updated');
    return updated;
  }

  /** Clears themeOverrides back to SQL NULL — "use the template's defaults unchanged". */
  async resetTheme(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<CoverLetter> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    const updated = await this.repository.update(id, { themeOverrides: Prisma.DbNull });
    this.emit(targetUserId, id, 'updated');
    return updated;
  }

  /** A brand-new, independent copy — "created", not "updated" (mirrors ResumeVariant.duplicate()'s Phase 3 precedent). Never charges credits; not AI-generated. */
  async duplicate(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<CoverLetter> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const source = await this.findOwnedOrThrow(targetUserId, id);

    const copy = await this.repository.create(targetUserId, {
      resumeVariantId: source.resumeVariantId,
      jobTargetId: source.jobTargetId,
      optimizationId: source.optimizationId ?? undefined,
      title: `${source.title} (copy)`,
      content: source.content,
      tone: source.tone,
      language: source.language,
      version: 1,
      status: 'DRAFT',
      creditsUsed: 0,
      generatedByAI: false,
    });
    this.emit(targetUserId, copy.id, 'created');
    return copy;
  }

  async archive(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<CoverLetter> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);
    if (existing.status === 'ARCHIVED') {
      return existing; // idempotent no-op — no duplicate history event
    }

    const updated = await this.repository.update(id, { status: 'ARCHIVED' });
    this.emit(targetUserId, id, 'archived');
    return updated;
  }

  /** Reverts to GENERATED or EDITED depending on `generatedByAI` — the closest deterministic reconstruction of the pre-archive status available from this table's own columns (no separate `archived` boolean + `status` pair exists here, unlike ResumeVariant — see cover-letter-engine.md "Archive/Restore"). */
  async restore(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<CoverLetter> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);
    if (existing.status !== 'ARCHIVED') {
      return existing; // idempotent no-op
    }

    const updated = await this.repository.update(id, {
      status: existing.generatedByAI ? 'GENERATED' : 'EDITED',
    });
    this.emit(targetUserId, id, 'restored');
    return updated;
  }

  async remove(requestingUser: RequestUser, targetUserId: string, id: string): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    await this.repository.softDelete(id);
    this.emit(targetUserId, id, 'deleted');
  }

  /** Reuses the most recent existing ATS report for this variant, or runs a fresh one if none exists — same pattern as ResumeOptimizationService.resolveBeforeReport() (Phase 7), minus the `force` flag (not part of this phase's brief). */
  private async resolveAtsReport(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
  ): Promise<AtsReport> {
    const existing = await this.atsReportRepository.findLatestByVariantId(variantId);
    if (existing) {
      return existing;
    }
    return this.atsAnalysisService.run(requestingUser, targetUserId, {
      resumeVariantId: variantId,
    });
  }

  private async resolveOptimizationSummary(
    requestingUser: RequestUser,
    targetUserId: string,
    optimizationId: string | undefined,
  ): Promise<string | null> {
    if (!optimizationId) {
      return null;
    }
    const optimization = await this.resumeOptimizationService.getOne(
      requestingUser,
      targetUserId,
      optimizationId,
    );
    return optimization.summary;
  }

  /** The only place AiOrchestrationService.execute() is called — shared by generate() and regenerate(). Always creates a brand-new row; there is no PENDING/FAILED CoverLetterStatus, so a failed generation persists nothing (the automatic credit refund inside AiOrchestrationService.execute() is the only bookkeeping a failure leaves behind). */
  private async runGeneration(
    targetUserId: string,
    params: GenerationParams,
  ): Promise<CoverLetter> {
    const promptInput: CoverLetterPromptInput = {
      resumeContent: (params.variant.content ?? {}) as Record<string, unknown>,
      jobTarget: params.jobTarget,
      atsReport: params.atsReport,
      optimizationSummary: params.optimizationSummary,
      tone: params.tone,
      language: params.language,
    };

    const result = await this.aiOrchestrationService.execute({
      userId: targetUserId,
      feature: AIFeature.COVER_LETTER,
      input: promptInput,
      idempotencyKey: `cover-letter:${targetUserId}:${randomUUID()}`,
      options: {
        responseFormat: 'json',
        responseValidator: (generateResult) => {
          CoverLetterResponseParser.parse(generateResult.text);
        },
      },
    });

    const parsed = CoverLetterResponseParser.parse(result.text);

    const created = await this.repository.create(targetUserId, {
      resumeVariantId: params.variant.id,
      jobTargetId: params.jobTarget.id,
      optimizationId: params.optimizationId,
      title: parsed.title,
      content: parsed.coverLetter,
      tone: params.tone,
      language: params.language,
      version: params.version,
      status: 'GENERATED',
      creditsUsed: result.creditsCharged,
      generatedByAI: true,
    });

    this.emit(targetUserId, created.id, 'generated');
    return created;
  }

  private async findOwnedOrThrow(targetUserId: string, id: string): Promise<CoverLetter> {
    const coverLetter = await this.repository.findById(id);
    if (!coverLetter || coverLetter.userId !== targetUserId) {
      throw new NotFoundException('Cover letter not found.');
    }
    return coverLetter;
  }

  private emit(userId: string, coverLetterId: string, action: CoverLetterAction): void {
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, 'cover_letter', coverLetterId, action),
    );
  }
}
