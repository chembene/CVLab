import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Application, ApplicationPipelineSession } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeVariantService } from '../resume-variant/resume-variant.service';
import { JobTargetService } from '../job-target/job-target.service';
import { AtsAnalysisService } from '../ats/ats-analysis.service';
import { ResumeOptimizationService } from '../resume-optimization/resume-optimization.service';
import { CoverLetterService } from '../cover-letter/cover-letter.service';
import { InterviewService } from '../interview/interview.service';
import { ExportService, type ExportResult } from '../export/export.service';
import { ApplicationService } from '../application/application.service';
import { ApplicationPipelineRepository } from './application-pipeline.repository';
import type { StartPipelineDto } from './dto/start-pipeline.dto';
import type { RunOptimizationStepDto } from './dto/run-optimization-step.dto';
import type { ApplySuggestionsStepDto } from './dto/apply-suggestions-step.dto';
import type { GenerateCoverLetterStepDto } from './dto/generate-cover-letter-step.dto';
import type { StartInterviewStepDto } from './dto/start-interview-step.dto';
import type { ExportStepDto } from './dto/export-step.dto';
import type { FinalizeStepDto } from './dto/finalize-step.dto';

/**
 * Pure orchestration layer for the Smart Application Pipeline — the guided
 * "Prepare Application" wizard. Every step below delegates to that step's
 * own already-existing, already-tested service (AtsAnalysisService,
 * ResumeOptimizationService, CoverLetterService, InterviewService,
 * ExportService, ApplicationService) and only records the resulting id +
 * advances `currentStep`. No business logic, no AI call, no credit charge,
 * and no Prisma access to any table other than `application_pipeline_sessions`
 * lives here — see docs/architecture/application-pipeline.md §"Architecture"
 * and module-boundaries.md's "Export Engine is not an AI feature" rule,
 * which applies here for the same reason (the Pipeline itself never touches
 * CreditService or AiOrchestrationService; each delegated-to service still
 * charges exactly what it already charges, independently).
 */
@Injectable()
export class ApplicationPipelineService {
  constructor(
    private readonly repository: ApplicationPipelineRepository,
    private readonly resumeVariantService: ResumeVariantService,
    private readonly jobTargetService: JobTargetService,
    private readonly atsAnalysisService: AtsAnalysisService,
    private readonly resumeOptimizationService: ResumeOptimizationService,
    private readonly coverLetterService: CoverLetterService,
    private readonly interviewService: InterviewService,
    private readonly exportService: ExportService,
    private readonly applicationService: ApplicationService,
  ) {}

  async start(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: StartPipelineDto,
  ): Promise<ApplicationPipelineSession> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    // Both re-verified independently through their own owning service —
    // never trust that a client-supplied (resumeVariantId, jobTargetId)
    // pair actually belongs to the same user together (IDOR: User A's
    // Variant + User B's Job Target must never be combinable).
    const variant = await this.resumeVariantService.getOne(
      requestingUser,
      targetUserId,
      dto.resumeVariantId,
    );
    await this.jobTargetService.getOne(requestingUser, targetUserId, dto.jobTargetId);

    if (variant.jobTargetId !== dto.jobTargetId) {
      await this.resumeVariantService.update(requestingUser, targetUserId, dto.resumeVariantId, {
        jobTargetId: dto.jobTargetId,
      });
    }

    return this.repository.create(targetUserId, dto.resumeVariantId, dto.jobTargetId);
  }

  async list(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<ApplicationPipelineSession[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.repository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<ApplicationPipelineSession> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, id);
  }

  async runAtsStep(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<ApplicationPipelineSession> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, id);

    const report = await this.atsAnalysisService.run(requestingUser, targetUserId, {
      resumeVariantId: session.resumeVariantId,
    });

    return this.repository.update(id, { atsReportId: report.id, currentStep: 'OPTIMIZATION' });
  }

  async runOptimizationStep(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: RunOptimizationStepDto,
  ): Promise<ApplicationPipelineSession> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, id);

    const optimization = await this.resumeOptimizationService.run(requestingUser, targetUserId, {
      resumeVariantId: session.resumeVariantId,
      force: dto.force,
    });

    return this.repository.update(id, {
      optimizationId: optimization.id,
      currentStep: 'SUGGESTION_REVIEW',
    });
  }

  async applySuggestionsStep(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: ApplySuggestionsStepDto,
  ): Promise<ApplicationPipelineSession> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, id);
    if (!session.optimizationId) {
      throw new BadRequestException('Run the optimization step before applying suggestions.');
    }

    const result = await this.resumeOptimizationService.apply(
      requestingUser,
      targetUserId,
      session.optimizationId,
      {
        suggestionIds: dto.suggestionIds,
      },
    );

    return this.repository.update(id, {
      newAtsReportId: result.newAtsReport.id,
      currentStep: 'COVER_LETTER',
    });
  }

  async generateCoverLetterStep(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: GenerateCoverLetterStepDto,
  ): Promise<ApplicationPipelineSession> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, id);

    const coverLetter = await this.coverLetterService.generate(requestingUser, targetUserId, {
      resumeVariantId: session.resumeVariantId,
      tone: dto.tone,
      language: dto.language,
      optimizationId: session.optimizationId ?? undefined,
    });

    return this.repository.update(id, {
      coverLetterId: coverLetter.id,
      currentStep: 'INTERVIEW_PREP',
    });
  }

  async startInterviewStep(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: StartInterviewStepDto,
  ): Promise<ApplicationPipelineSession> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, id);

    // Mode JOB — the Pipeline always has a Job Target by construction. Only
    // creates the session (never charges); generating/answering/evaluating
    // questions continues in the normal Interview module UI, per the
    // brief's "not every step must run automatically."
    const interview = await this.interviewService.start(requestingUser, targetUserId, {
      mode: 'JOB',
      resumeVariantId: session.resumeVariantId,
      jobTargetId: session.jobTargetId,
      type: dto.type,
      difficulty: dto.difficulty,
      language: dto.language,
      optimizationId: session.optimizationId ?? undefined,
      coverLetterId: session.coverLetterId ?? undefined,
    });

    return this.repository.update(id, { interviewSessionId: interview.id, currentStep: 'EXPORT' });
  }

  async exportStep(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: ExportStepDto,
  ): Promise<{ session: ApplicationPipelineSession; file: ExportResult }> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, id);

    const file = await this.exportService.exportResume(requestingUser, targetUserId, {
      resumeVariantId: session.resumeVariantId,
      format: dto.format,
    });

    const updated = await this.repository.update(id, {
      exportedDocumentId: file.exportedDocumentId,
      currentStep: 'FINALIZE',
    });

    return { session: updated, file };
  }

  async finalizeStep(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: FinalizeStepDto,
  ): Promise<{ session: ApplicationPipelineSession; application: Application }> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, id);

    const application = await this.applicationService.create(requestingUser, targetUserId, {
      jobTargetId: session.jobTargetId,
      resumeVariantId: session.resumeVariantId,
      status: dto.status,
      notes: dto.notes,
    });

    const updated = await this.repository.update(id, {
      applicationId: application.id,
      currentStep: 'SUMMARY',
      status: 'COMPLETED',
      completedAt: new Date(),
    });

    return { session: updated, application };
  }

  async abandon(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<ApplicationPipelineSession> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);
    return this.repository.update(id, { status: 'ABANDONED' });
  }

  private async findOwnedOrThrow(
    targetUserId: string,
    id: string,
  ): Promise<ApplicationPipelineSession> {
    const session = await this.repository.findById(id);
    if (!session || session.userId !== targetUserId) {
      throw new NotFoundException('Application pipeline session not found.');
    }
    return session;
  }
}
