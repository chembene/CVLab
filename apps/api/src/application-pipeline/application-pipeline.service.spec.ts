import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApplicationPipelineService } from './application-pipeline.service';
import type { ApplicationPipelineRepository } from './application-pipeline.repository';
import type { ResumeVariantService } from '../resume-variant/resume-variant.service';
import type { JobTargetService } from '../job-target/job-target.service';
import type { AtsAnalysisService } from '../ats/ats-analysis.service';
import type { ResumeOptimizationService } from '../resume-optimization/resume-optimization.service';
import type { CoverLetterService } from '../cover-letter/cover-letter.service';
import type { InterviewService } from '../interview/interview.service';
import type { ExportService } from '../export/export.service';
import type { ApplicationService } from '../application/application.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('ApplicationPipelineService', () => {
  let repository: jest.Mocked<ApplicationPipelineRepository>;
  let resumeVariantService: jest.Mocked<ResumeVariantService>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let atsAnalysisService: jest.Mocked<AtsAnalysisService>;
  let resumeOptimizationService: jest.Mocked<ResumeOptimizationService>;
  let coverLetterService: jest.Mocked<CoverLetterService>;
  let interviewService: jest.Mocked<InterviewService>;
  let exportService: jest.Mocked<ExportService>;
  let applicationService: jest.Mocked<ApplicationService>;
  let service: ApplicationPipelineService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const variant = { id: 'rv-1', userId: 'user-1', jobTargetId: null as string | null };
  const jobTarget = { id: 'jt-1', userId: 'user-1' };
  const baseSession = {
    id: 'session-1',
    userId: 'user-1',
    resumeVariantId: 'rv-1',
    jobTargetId: 'jt-1',
    atsReportId: null as string | null,
    optimizationId: null as string | null,
    newAtsReportId: null as string | null,
    coverLetterId: null as string | null,
    interviewSessionId: null as string | null,
    exportedDocumentId: null as string | null,
    applicationId: null as string | null,
    currentStep: 'ATS_ANALYSIS',
    status: 'IN_PROGRESS',
  };

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(baseSession),
      findById: jest.fn().mockResolvedValue(baseSession),
      findAllByUserId: jest.fn(),
      update: jest
        .fn()
        .mockImplementation((_id, data) => Promise.resolve({ ...baseSession, ...data })),
    } as unknown as jest.Mocked<ApplicationPipelineRepository>;
    resumeVariantService = {
      getOne: jest.fn().mockResolvedValue(variant),
      update: jest.fn(),
    } as unknown as jest.Mocked<ResumeVariantService>;
    jobTargetService = {
      getOne: jest.fn().mockResolvedValue(jobTarget),
    } as unknown as jest.Mocked<JobTargetService>;
    atsAnalysisService = {
      run: jest.fn().mockResolvedValue({ id: 'ats-1' }),
    } as unknown as jest.Mocked<AtsAnalysisService>;
    resumeOptimizationService = {
      run: jest.fn().mockResolvedValue({ id: 'opt-1' }),
      apply: jest.fn().mockResolvedValue({ newAtsReport: { id: 'ats-2' } }),
    } as unknown as jest.Mocked<ResumeOptimizationService>;
    coverLetterService = {
      generate: jest.fn().mockResolvedValue({ id: 'cl-1' }),
    } as unknown as jest.Mocked<CoverLetterService>;
    interviewService = {
      start: jest.fn().mockResolvedValue({ id: 'iv-1' }),
    } as unknown as jest.Mocked<InterviewService>;
    exportService = {
      exportResume: jest.fn().mockResolvedValue({
        buffer: Buffer.from('pdf'),
        fileName: 'curriculo.pdf',
        contentType: 'application/pdf',
        exportedDocumentId: 'export-1',
      }),
    } as unknown as jest.Mocked<ExportService>;
    applicationService = {
      create: jest.fn().mockResolvedValue({ id: 'app-1' }),
    } as unknown as jest.Mocked<ApplicationService>;

    service = new ApplicationPipelineService(
      repository,
      resumeVariantService,
      jobTargetService,
      atsAnalysisService,
      resumeOptimizationService,
      coverLetterService,
      interviewService,
      exportService,
      applicationService,
    );
  });

  describe('start', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(
        service.start(stranger, 'user-1', { resumeVariantId: 'rv-1', jobTargetId: 'jt-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('verifies the Variant and Job Target ownership independently (never trusts the pairing)', async () => {
      await service.start(owner, 'user-1', { resumeVariantId: 'rv-1', jobTargetId: 'jt-1' });
      expect(resumeVariantService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'rv-1');
      expect(jobTargetService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'jt-1');
    });

    it('links the Variant to the Job Target when not already linked', async () => {
      await service.start(owner, 'user-1', { resumeVariantId: 'rv-1', jobTargetId: 'jt-1' });
      expect(resumeVariantService.update).toHaveBeenCalledWith(owner, 'user-1', 'rv-1', {
        jobTargetId: 'jt-1',
      });
    });

    it('does not re-link when the Variant is already linked to this Job Target', async () => {
      resumeVariantService.getOne.mockResolvedValue({ ...variant, jobTargetId: 'jt-1' } as never);
      await service.start(owner, 'user-1', { resumeVariantId: 'rv-1', jobTargetId: 'jt-1' });
      expect(resumeVariantService.update).not.toHaveBeenCalled();
    });

    it('creates the session via the repository', async () => {
      await service.start(owner, 'user-1', { resumeVariantId: 'rv-1', jobTargetId: 'jt-1' });
      expect(repository.create).toHaveBeenCalledWith('user-1', 'rv-1', 'jt-1');
    });
  });

  describe('session ownership (shared by every step)', () => {
    it('throws NotFound for a session belonging to another user', async () => {
      repository.findById.mockResolvedValue({ ...baseSession, userId: 'user-2' } as never);
      await expect(service.runAtsStep(owner, 'user-1', 'session-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFound for a non-existent session', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.runAtsStep(owner, 'user-1', 'session-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('runAtsStep', () => {
    it("delegates to AtsAnalysisService.run with the session's resumeVariantId, records atsReportId, advances to OPTIMIZATION", async () => {
      await service.runAtsStep(owner, 'user-1', 'session-1');
      expect(atsAnalysisService.run).toHaveBeenCalledWith(owner, 'user-1', {
        resumeVariantId: 'rv-1',
      });
      expect(repository.update).toHaveBeenCalledWith('session-1', {
        atsReportId: 'ats-1',
        currentStep: 'OPTIMIZATION',
      });
    });
  });

  describe('runOptimizationStep', () => {
    it('delegates to ResumeOptimizationService.run, records optimizationId, advances to SUGGESTION_REVIEW', async () => {
      await service.runOptimizationStep(owner, 'user-1', 'session-1', { force: true });
      expect(resumeOptimizationService.run).toHaveBeenCalledWith(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        force: true,
      });
      expect(repository.update).toHaveBeenCalledWith('session-1', {
        optimizationId: 'opt-1',
        currentStep: 'SUGGESTION_REVIEW',
      });
    });
  });

  describe('applySuggestionsStep', () => {
    it('throws BadRequest when no optimization has run yet', async () => {
      await expect(
        service.applySuggestionsStep(owner, 'user-1', 'session-1', { suggestionIds: ['s1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(resumeOptimizationService.apply).not.toHaveBeenCalled();
    });

    it("delegates to ResumeOptimizationService.apply using the session's optimizationId, records the new ATS report, advances to COVER_LETTER", async () => {
      repository.findById.mockResolvedValue({ ...baseSession, optimizationId: 'opt-1' } as never);
      await service.applySuggestionsStep(owner, 'user-1', 'session-1', {
        suggestionIds: ['s1', 's2'],
      });
      expect(resumeOptimizationService.apply).toHaveBeenCalledWith(owner, 'user-1', 'opt-1', {
        suggestionIds: ['s1', 's2'],
      });
      expect(repository.update).toHaveBeenCalledWith('session-1', {
        newAtsReportId: 'ats-2',
        currentStep: 'COVER_LETTER',
      });
    });
  });

  describe('generateCoverLetterStep', () => {
    it("delegates to CoverLetterService.generate with the session's resumeVariantId and optimizationId, records coverLetterId, advances to INTERVIEW_PREP", async () => {
      repository.findById.mockResolvedValue({ ...baseSession, optimizationId: 'opt-1' } as never);
      await service.generateCoverLetterStep(owner, 'user-1', 'session-1', {
        tone: 'PROFESSIONAL',
        language: 'pt-MZ',
      } as never);
      expect(coverLetterService.generate).toHaveBeenCalledWith(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        tone: 'PROFESSIONAL',
        language: 'pt-MZ',
        optimizationId: 'opt-1',
      });
      expect(repository.update).toHaveBeenCalledWith('session-1', {
        coverLetterId: 'cl-1',
        currentStep: 'INTERVIEW_PREP',
      });
    });

    it('passes undefined optimizationId when the session has none yet', async () => {
      await service.generateCoverLetterStep(owner, 'user-1', 'session-1', {
        tone: 'PROFESSIONAL',
        language: 'pt-MZ',
      } as never);
      expect(coverLetterService.generate).toHaveBeenCalledWith(
        owner,
        'user-1',
        expect.objectContaining({ optimizationId: undefined }),
      );
    });
  });

  describe('startInterviewStep', () => {
    it("delegates to InterviewService.start in mode JOB using the session's ids, records interviewSessionId, advances to EXPORT", async () => {
      repository.findById.mockResolvedValue({
        ...baseSession,
        optimizationId: 'opt-1',
        coverLetterId: 'cl-1',
      } as never);
      await service.startInterviewStep(owner, 'user-1', 'session-1', {
        type: 'MIXED',
        difficulty: 'MID',
        language: 'pt-MZ',
      } as never);
      expect(interviewService.start).toHaveBeenCalledWith(owner, 'user-1', {
        mode: 'JOB',
        resumeVariantId: 'rv-1',
        jobTargetId: 'jt-1',
        type: 'MIXED',
        difficulty: 'MID',
        language: 'pt-MZ',
        optimizationId: 'opt-1',
        coverLetterId: 'cl-1',
      });
      expect(repository.update).toHaveBeenCalledWith('session-1', {
        interviewSessionId: 'iv-1',
        currentStep: 'EXPORT',
      });
    });
  });

  describe('exportStep', () => {
    it('delegates to ExportService.exportResume, records exportedDocumentId, advances to FINALIZE, and returns the file', async () => {
      const { session, file } = await service.exportStep(owner, 'user-1', 'session-1', {
        format: 'PDF',
      } as never);
      expect(exportService.exportResume).toHaveBeenCalledWith(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        format: 'PDF',
      });
      expect(repository.update).toHaveBeenCalledWith('session-1', {
        exportedDocumentId: 'export-1',
        currentStep: 'FINALIZE',
      });
      expect(file.exportedDocumentId).toBe('export-1');
      expect(session.exportedDocumentId).toBe('export-1');
    });
  });

  describe('finalizeStep', () => {
    it("delegates to ApplicationService.create using the session's jobTargetId/resumeVariantId, records applicationId, marks the session COMPLETED", async () => {
      const { session, application } = await service.finalizeStep(owner, 'user-1', 'session-1', {
        status: 'APPLIED',
      } as never);
      expect(applicationService.create).toHaveBeenCalledWith(owner, 'user-1', {
        jobTargetId: 'jt-1',
        resumeVariantId: 'rv-1',
        status: 'APPLIED',
        notes: undefined,
      });
      expect(repository.update).toHaveBeenCalledWith('session-1', {
        applicationId: 'app-1',
        currentStep: 'SUMMARY',
        status: 'COMPLETED',
        completedAt: expect.any(Date),
      });
      expect(application.id).toBe('app-1');
      expect(session.applicationId).toBe('app-1');
    });
  });

  describe('abandon', () => {
    it('marks the session ABANDONED', async () => {
      await service.abandon(owner, 'user-1', 'session-1');
      expect(repository.update).toHaveBeenCalledWith('session-1', { status: 'ABANDONED' });
    });
  });

  describe('list / getOne', () => {
    it('list() denies a non-owner', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('getOne() returns the owned session', async () => {
      const result = await service.getOne(owner, 'user-1', 'session-1');
      expect(result.id).toBe('session-1');
    });
  });
});
