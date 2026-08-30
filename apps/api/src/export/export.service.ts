import { Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeVariantService } from '../resume-variant/resume-variant.service';
import { ResumeVersionRepository } from '../resume-version/resume-version.repository';
import { ProfileService } from '../profile/profile.service';
import { CreditService } from '../credits/credit.service';
import { InsufficientCreditsException } from '../credits/errors/insufficient-credits.exception';
import { ExportRepository } from './export.repository';
import { EXPORT_FEATURE_KEY } from './export-pricing';
import { PdfResumeRenderer } from './renderers/pdf-resume.renderer';
import { DocxResumeRenderer } from './renderers/docx-resume.renderer';
import type { ResumeRenderResult } from './interfaces/resume-render-input.interface';
import type { ThemeOverrides } from '@cvlab/resume-renderer';
import type { CreateExportDto } from './dto/create-export.dto';

/** Adds the ExportedDocument row's own id to the renderer's output — needed by callers (Smart Application Pipeline) that must record which export a step produced. Never returned to the HTTP client (ExportController only reads .buffer/.fileName/.contentType, unaffected by the extra field). */
export interface ExportResult extends ResumeRenderResult {
  exportedDocumentId: string;
}

/**
 * Orchestrates a Resume export end-to-end — resolve version → check
 * ownership → compute a deterministic idempotency key → charge credits
 * directly via CreditService (never AiOrchestrationService: no AI/provider
 * call is involved) → render → persist the ExportedDocument audit row.
 * See docs/architecture/export-engine.md for the full flow, and §"Credits"
 * for why this is the first paid feature to bypass AI Orchestration on
 * purpose.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly repository: ExportRepository,
    private readonly resumeVariantService: ResumeVariantService,
    private readonly resumeVersionRepository: ResumeVersionRepository,
    private readonly profileService: ProfileService,
    private readonly creditService: CreditService,
    private readonly pdfRenderer: PdfResumeRenderer,
    private readonly docxRenderer: DocxResumeRenderer,
  ) {}

  async exportResume(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: CreateExportDto,
  ): Promise<ExportResult> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const variant = await this.resumeVariantService.getOne(
      requestingUser,
      targetUserId,
      dto.resumeVariantId,
    );

    let content: Record<string, unknown>;
    let resolvedVersionNumber: number;
    let resumeVariantVersionId: string | undefined;

    if (dto.resumeVariantVersionId) {
      // "Se resumeVariantVersionId for fornecido: verificar ownership;
      // verificar que pertence ao Resume Variant indicado; usar EXATAMENTE
      // aquele conteúdo; nunca usar silenciosamente a versão atual."
      const version = await this.resumeVersionRepository.findByIdWithinVariant(
        dto.resumeVariantVersionId,
        variant.id,
        targetUserId,
      );
      if (!version) {
        throw new NotFoundException('Resume version not found.');
      }
      content = version.content as Record<string, unknown>;
      resolvedVersionNumber = version.versionNumber;
      resumeVariantVersionId = version.id;
    } else {
      content = variant.content as Record<string, unknown>;
      resolvedVersionNumber = variant.version;
    }

    // Deterministic — never randomUUID() — so a repeated identical request
    // reuses the same ExportedDocument row and the same CreditService
    // idempotency key, guaranteeing no double charge on replay.
    const idempotencyKey = `export:resume:${targetUserId}:${variant.id}:${resolvedVersionNumber}:${dto.format}`;

    const record = await this.repository.upsertPending({
      userId: targetUserId,
      resumeVariantId: variant.id,
      resumeVariantVersionId,
      format: dto.format,
      idempotencyKey,
    });

    const featureKey = EXPORT_FEATURE_KEY[dto.format];
    const estimate = await this.creditService.estimate(targetUserId, featureKey);
    if (!estimate.sufficientBalance) {
      // Nothing was charged and nothing was rendered, but the record was
      // already created by upsertPending() above — it must not be left
      // dangling at PENDING forever. 0/0 charged/refunded keeps the audit
      // trail honest: this export never even attempted to spend credits.
      await this.repository.markFailed(
        record.id,
        0,
        0,
        `Insufficient credits for "${featureKey}".`,
      );
      throw new InsufficientCreditsException(`Insufficient credits for "${featureKey}".`);
    }

    const profile = await this.profileService.getForUser(requestingUser, targetUserId);
    const themeOverrides = (variant.themeOverrides as ThemeOverrides | null) ?? null;

    try {
      const result = await this.creditService.spendAndExecute(
        targetUserId,
        {
          amount: estimate.cost,
          reference: record.id,
          description: `Export: ${featureKey}`,
          idempotencyKey,
          metadata: {
            exportedDocumentId: record.id,
            resumeVariantId: variant.id,
            format: dto.format,
          },
        },
        async () => {
          const renderer = dto.format === 'PDF' ? this.pdfRenderer : this.docxRenderer;
          return renderer.render({
            content,
            profile,
            templateId: variant.templateId,
            themeOverrides,
          });
        },
      );

      await this.repository.markSuccess(record.id, estimate.cost);
      return { ...result, exportedDocumentId: record.id };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Unknown export failure.';
      await this.repository.markFailed(record.id, estimate.cost, estimate.cost, failureReason);
      throw error;
    }
  }
}
