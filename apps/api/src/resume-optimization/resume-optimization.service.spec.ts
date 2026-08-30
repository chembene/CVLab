import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ResumeOptimizationService } from './resume-optimization.service';
import type { ResumeOptimizationRepository } from './resume-optimization.repository';
import type { ResumeVariantService } from '../resume-variant/resume-variant.service';
import type { ResumeVariantRepository } from '../resume-variant/resume-variant.repository';
import type { JobTargetService } from '../job-target/job-target.service';
import type { AtsAnalysisService } from '../ats/ats-analysis.service';
import type { AtsReportRepository } from '../ats/ats-report.repository';
import type { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';

describe('ResumeOptimizationService', () => {
  let prisma: { $transaction: jest.Mock };
  let repository: jest.Mocked<ResumeOptimizationRepository>;
  let resumeVariantService: jest.Mocked<ResumeVariantService>;
  let resumeVariantRepository: jest.Mocked<ResumeVariantRepository>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let atsAnalysisService: jest.Mocked<AtsAnalysisService>;
  let atsReportRepository: jest.Mocked<AtsReportRepository>;
  let aiOrchestrationService: jest.Mocked<AiOrchestrationService>;
  let eventEmitter: { emit: jest.Mock };
  let service: ResumeOptimizationService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };
  const tx = { resumeVariant: {}, optimizationSuggestion: {} };

  const variant = {
    id: 'rv-1',
    title: 'Backend Engineer Resume',
    jobTargetId: 'jt-1',
    content: {
      summary: 'Old summary.',
      workExperiences: [{ company: 'Acme', description: 'Led backend team.' }],
      skills: [{ name: 'TypeScript' }],
    },
  };
  const jobTarget = {
    id: 'jt-1',
    title: 'Senior Backend Engineer',
    keywords: [],
    skills: [],
    languages: [],
  };
  const beforeReport = { id: 'ats-1', resumeVariantId: 'rv-1', overallScore: 60 };
  const pendingOptimization = { id: 'opt-1', userId: 'user-1', status: 'PENDING' };
  const validAiResponse = JSON.stringify({
    summary: 'Optimize the summary and add missing skills.',
    predictedScore: 85,
    suggestions: [
      {
        type: 'SUMMARY',
        section: 'summary',
        priority: 'HIGH',
        title: 'Sharpen the summary',
        reason: 'Too generic.',
        originalText: 'Old summary.',
        suggestedText: 'New, sharper summary.',
      },
    ],
  });

  beforeEach(() => {
    prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)) };
    repository = {
      create: jest.fn().mockResolvedValue(pendingOptimization),
      completeWithSuggestions: jest
        .fn()
        .mockResolvedValue({ id: 'opt-1', status: 'COMPLETED', suggestions: [] }),
      markFailed: jest.fn(),
      findAllByUserId: jest.fn(),
      findById: jest.fn(),
      softDelete: jest.fn(),
      markApplyOutcome: jest.fn(),
    } as unknown as jest.Mocked<ResumeOptimizationRepository>;
    resumeVariantService = {
      getOne: jest.fn().mockResolvedValue(variant),
      snapshotBeforeAiAction: jest.fn().mockResolvedValue(undefined),
      recordAppliedContentVersion: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ResumeVariantService>;
    resumeVariantRepository = {
      applyEdit: jest.fn().mockResolvedValue({ id: 'rv-1', version: 2 }),
    } as unknown as jest.Mocked<ResumeVariantRepository>;
    jobTargetService = {
      getOne: jest.fn().mockResolvedValue(jobTarget),
    } as unknown as jest.Mocked<JobTargetService>;
    atsAnalysisService = {
      run: jest.fn().mockResolvedValue(beforeReport),
    } as unknown as jest.Mocked<AtsAnalysisService>;
    atsReportRepository = {
      findLatestByVariantId: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<AtsReportRepository>;
    aiOrchestrationService = {
      execute: jest.fn().mockResolvedValue({ text: validAiResponse, creditsCharged: 80 }),
    } as unknown as jest.Mocked<AiOrchestrationService>;
    eventEmitter = { emit: jest.fn() };

    service = new ResumeOptimizationService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      repository,
      resumeVariantService,
      resumeVariantRepository,
      jobTargetService,
      atsAnalysisService,
      atsReportRepository,
      aiOrchestrationService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventEmitter as any,
    );
  });

  describe('run', () => {
    it('denies a non-owner, non-admin user before touching the variant', async () => {
      await expect(
        service.run(stranger, 'user-1', { resumeVariantId: 'rv-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(resumeVariantService.getOne).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the resume variant has no linked job target', async () => {
      resumeVariantService.getOne.mockResolvedValue({ ...variant, jobTargetId: null } as never);

      await expect(
        service.run(owner, 'user-1', { resumeVariantId: 'rv-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('reuses the most recent existing ATS report when one exists and force is not set', async () => {
      atsReportRepository.findLatestByVariantId.mockResolvedValue(beforeReport as never);

      await service.run(owner, 'user-1', { resumeVariantId: 'rv-1' });

      expect(atsReportRepository.findLatestByVariantId).toHaveBeenCalledWith('rv-1');
      expect(atsAnalysisService.run).not.toHaveBeenCalledWith(owner, 'user-1', {
        resumeVariantId: 'rv-1',
      });
    });

    it('runs a fresh ATS report when none exists yet', async () => {
      atsReportRepository.findLatestByVariantId.mockResolvedValue(null);

      await service.run(owner, 'user-1', { resumeVariantId: 'rv-1' });

      expect(atsAnalysisService.run).toHaveBeenCalledWith(owner, 'user-1', {
        resumeVariantId: 'rv-1',
      });
    });

    it('runs a fresh ATS report when force is true even if one already exists', async () => {
      atsReportRepository.findLatestByVariantId.mockResolvedValue({ id: 'stale-report' } as never);

      await service.run(owner, 'user-1', { resumeVariantId: 'rv-1', force: true });

      expect(atsReportRepository.findLatestByVariantId).not.toHaveBeenCalled();
      expect(atsAnalysisService.run).toHaveBeenCalledWith(owner, 'user-1', {
        resumeVariantId: 'rv-1',
      });
    });

    it('creates a PENDING row, emits "started", executes via AiOrchestrationService, and completes with parsed suggestions', async () => {
      repository.completeWithSuggestions.mockResolvedValue({
        id: 'opt-1',
        status: 'COMPLETED',
        suggestions: [],
      } as never);

      const result = await service.run(owner, 'user-1', { resumeVariantId: 'rv-1' });

      expect(repository.create).toHaveBeenCalledWith('user-1', {
        resumeVariantId: 'rv-1',
        jobTargetId: 'jt-1',
        atsReportId: 'ats-1',
        beforeScore: 60,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'optimization',
          entityId: 'opt-1',
          action: 'started',
        }),
      );

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          feature: AIFeature.RESUME_OPTIMIZATION,
          idempotencyKey: 'resume-optimization:opt-1',
          options: expect.objectContaining({ responseFormat: 'json' }),
        }),
      );

      expect(repository.completeWithSuggestions).toHaveBeenCalledWith('opt-1', {
        creditsUsed: 80,
        predictedScore: 85,
        summary: 'Optimize the summary and add missing skills.',
        suggestions: [expect.objectContaining({ title: 'Sharpen the summary', displayOrder: 0 })],
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'optimization',
          entityId: 'opt-1',
          action: 'completed',
        }),
      );
      expect(result).toEqual({ id: 'opt-1', status: 'COMPLETED', suggestions: [] });
    });

    it('auto-snapshots the resume state before running optimization (Phase 10.5 rule 8)', async () => {
      await service.run(owner, 'user-1', { resumeVariantId: 'rv-1' });

      expect(resumeVariantService.snapshotBeforeAiAction).toHaveBeenCalledWith(
        owner,
        'user-1',
        'rv-1',
        expect.objectContaining({ jobTargetId: 'jt-1' }),
      );
    });

    it('on AiOrchestrationService failure: marks the row FAILED, emits "failed", and rethrows', async () => {
      const failure = new InvalidPromptError('AI response is not valid JSON.');
      aiOrchestrationService.execute.mockRejectedValue(failure);

      await expect(service.run(owner, 'user-1', { resumeVariantId: 'rv-1' })).rejects.toBe(failure);

      expect(repository.markFailed).toHaveBeenCalledWith('opt-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'optimization',
          entityId: 'opt-1',
          action: 'failed',
        }),
      );
      expect(repository.completeWithSuggestions).not.toHaveBeenCalled();
    });

    it('the responseValidator passed to AiOrchestrationService throws InvalidPromptError on malformed AI text', async () => {
      await service.run(owner, 'user-1', { resumeVariantId: 'rv-1' });

      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(() => executeArgs.options!.responseValidator!({ text: 'not json' } as never)).toThrow(
        InvalidPromptError,
      );
    });
  });

  describe('list / getOne', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound for an optimization belonging to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'opt-1', userId: 'someone-else' } as never);
      await expect(service.getOne(owner, 'user-1', 'opt-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("admin can access another user's optimization", async () => {
      const admin: RequestUser = { id: 'admin-1', role: UserRole.ADMIN };
      repository.findAllByUserId.mockResolvedValue([]);

      await expect(service.list(admin, 'user-1')).resolves.toEqual([]);
    });
  });

  describe('apply', () => {
    const completedOptimization = {
      id: 'opt-1',
      userId: 'user-1',
      resumeVariantId: 'rv-1',
      status: 'COMPLETED',
      suggestions: [
        {
          id: 's1',
          section: 'summary',
          originalText: 'Old summary.',
          suggestedText: 'New summary.',
          applied: false,
        },
        {
          id: 's2',
          section: 'skills',
          originalText: '',
          suggestedText: 'Kubernetes',
          applied: false,
        },
      ],
    };

    it('denies a non-owner, non-admin user', async () => {
      await expect(
        service.apply(stranger, 'user-1', 'opt-1', { suggestionIds: ['s1'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequest when the optimization is not COMPLETED', async () => {
      repository.findById.mockResolvedValue({
        ...completedOptimization,
        status: 'PENDING',
      } as never);
      await expect(
        service.apply(owner, 'user-1', 'opt-1', { suggestionIds: ['s1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequest when none of the requested suggestionIds belong to this optimization', async () => {
      repository.findById.mockResolvedValue(completedOptimization as never);
      await expect(
        service.apply(owner, 'user-1', 'opt-1', { suggestionIds: ['does-not-exist'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequest when every requested suggestion is already applied', async () => {
      repository.findById.mockResolvedValue({
        ...completedOptimization,
        suggestions: [{ ...completedOptimization.suggestions[0], applied: true }],
      } as never);
      await expect(
        service.apply(owner, 'user-1', 'opt-1', { suggestionIds: ['s1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('applies accepted suggestions inside one transaction, emits "applied" per suggestion, and re-runs ATS', async () => {
      repository.findById.mockResolvedValue(completedOptimization as never);
      atsAnalysisService.run.mockResolvedValue({ id: 'ats-2', overallScore: 85 } as never);
      resumeVariantRepository.applyEdit.mockResolvedValue({
        id: 'rv-1',
        version: 6,
        content: { summary: 'New summary.' },
      } as never);

      const result = await service.apply(owner, 'user-1', 'opt-1', { suggestionIds: ['s1', 's2'] });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(resumeVariantRepository.applyEdit).toHaveBeenCalledWith(
        'rv-1',
        expect.objectContaining({ content: expect.objectContaining({ summary: 'New summary.' }) }),
        tx,
      );
      expect(repository.markApplyOutcome).toHaveBeenCalledWith(tx, ['s1', 's2'], []);

      // Auto-snapshot hook (Phase 10.5 rule 8) — the actual content-mutation
      // point. Must receive the transaction's already-updated variant (with
      // its already-bumped version) rather than triggering a second bump.
      expect(resumeVariantService.recordAppliedContentVersion).toHaveBeenCalledWith(
        owner,
        'user-1',
        expect.objectContaining({ id: 'rv-1', version: 6 }),
        expect.objectContaining({ summary: 'New summary.' }),
        expect.objectContaining({ changeSummary: expect.stringContaining('2') }),
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'suggestion', entityId: 's1', action: 'applied' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'suggestion', entityId: 's2', action: 'applied' }),
      );

      expect(atsAnalysisService.run).toHaveBeenCalledWith(owner, 'user-1', {
        resumeVariantId: 'rv-1',
      });
      expect(result.appliedSuggestionIds).toEqual(['s1', 's2']);
      expect(result.skippedSuggestionIds).toEqual([]);
      expect(result.newAtsReport).toEqual({ id: 'ats-2', overallScore: 85 });
    });

    it('only applies the not-yet-applied subset when some requested suggestions were already applied', async () => {
      repository.findById.mockResolvedValue({
        ...completedOptimization,
        suggestions: [
          { ...completedOptimization.suggestions[0], applied: true },
          completedOptimization.suggestions[1],
        ],
      } as never);

      const result = await service.apply(owner, 'user-1', 'opt-1', { suggestionIds: ['s1', 's2'] });

      expect(result.appliedSuggestionIds).toEqual(['s2']);
    });
  });

  describe('remove', () => {
    it('soft-deletes and emits "deleted"', async () => {
      repository.findById.mockResolvedValue({ id: 'opt-1', userId: 'user-1' } as never);

      await service.remove(owner, 'user-1', 'opt-1');

      expect(repository.softDelete).toHaveBeenCalledWith('opt-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'optimization',
          entityId: 'opt-1',
          action: 'deleted',
        }),
      );
    });

    it('throws NotFound instead of deleting when the optimization belongs to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'opt-1', userId: 'someone-else' } as never);

      await expect(service.remove(owner, 'user-1', 'opt-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.softDelete).not.toHaveBeenCalled();
    });
  });
});
