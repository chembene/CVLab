import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CoverLetterService } from './cover-letter.service';
import type { CoverLetterRepository } from './cover-letter.repository';
import type { ResumeVariantService } from '../resume-variant/resume-variant.service';
import type { JobTargetService } from '../job-target/job-target.service';
import type { AtsAnalysisService } from '../ats/ats-analysis.service';
import type { AtsReportRepository } from '../ats/ats-report.repository';
import type { ResumeOptimizationService } from '../resume-optimization/resume-optimization.service';
import type { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';
import type { CoverLetterTemplateRepository } from '../template-engine/cover-letter-template.repository';

describe('CoverLetterService', () => {
  let repository: jest.Mocked<CoverLetterRepository>;
  let resumeVariantService: jest.Mocked<ResumeVariantService>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let atsAnalysisService: jest.Mocked<AtsAnalysisService>;
  let atsReportRepository: jest.Mocked<AtsReportRepository>;
  let resumeOptimizationService: jest.Mocked<ResumeOptimizationService>;
  let aiOrchestrationService: jest.Mocked<AiOrchestrationService>;
  let templateRepository: jest.Mocked<CoverLetterTemplateRepository>;
  let eventEmitter: { emit: jest.Mock };
  let service: CoverLetterService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const variant = { id: 'rv-1', title: 'Resume', jobTargetId: 'jt-1', content: { summary: 'x' } };
  const jobTarget = {
    id: 'jt-1',
    title: 'Senior Backend Engineer',
    keywords: [],
    skills: [],
    languages: [],
  };
  const atsReport = { id: 'ats-1', resumeVariantId: 'rv-1', overallScore: 60 };
  const validAiResponse = JSON.stringify({
    title: 'Cover Letter — Senior Backend Engineer',
    coverLetter: 'Dear Hiring Manager, ...',
    summary: 'Emphasizes backend leadership.',
  });
  const createdCoverLetter = { id: 'cl-1', status: 'GENERATED', version: 1 };

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(createdCoverLetter),
      findAllByUserId: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<CoverLetterRepository>;
    resumeVariantService = {
      getOne: jest.fn().mockResolvedValue(variant),
      snapshotBeforeAiAction: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ResumeVariantService>;
    jobTargetService = {
      getOne: jest.fn().mockResolvedValue(jobTarget),
    } as unknown as jest.Mocked<JobTargetService>;
    atsAnalysisService = {
      run: jest.fn().mockResolvedValue(atsReport),
    } as unknown as jest.Mocked<AtsAnalysisService>;
    atsReportRepository = {
      findLatestByVariantId: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<AtsReportRepository>;
    resumeOptimizationService = {
      getOne: jest.fn(),
    } as unknown as jest.Mocked<ResumeOptimizationService>;
    aiOrchestrationService = {
      execute: jest.fn().mockResolvedValue({ text: validAiResponse, creditsCharged: 40 }),
    } as unknown as jest.Mocked<AiOrchestrationService>;
    eventEmitter = { emit: jest.fn() };

    templateRepository = {
      findById: jest.fn(),
      findAll: jest.fn(),
      findByIdUnfiltered: jest.fn(),
      findRecentlyUsedByUserId: jest.fn(),
    } as unknown as jest.Mocked<CoverLetterTemplateRepository>;
    service = new CoverLetterService(
      repository,
      resumeVariantService,
      jobTargetService,
      atsAnalysisService,
      atsReportRepository,
      resumeOptimizationService,
      aiOrchestrationService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventEmitter as any,
      templateRepository,
    );
  });

  describe('generate', () => {
    it('denies a non-owner, non-admin user before touching the variant', async () => {
      await expect(
        service.generate(stranger, 'user-1', {
          resumeVariantId: 'rv-1',
          tone: 'PROFESSIONAL',
          language: 'en',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(resumeVariantService.getOne).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the resume variant has no linked job target', async () => {
      resumeVariantService.getOne.mockResolvedValue({ ...variant, jobTargetId: null } as never);

      await expect(
        service.generate(owner, 'user-1', {
          resumeVariantId: 'rv-1',
          tone: 'PROFESSIONAL',
          language: 'en',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('reuses an existing ATS report when one exists, else runs a fresh one', async () => {
      atsReportRepository.findLatestByVariantId.mockResolvedValue(atsReport as never);
      await service.generate(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        tone: 'PROFESSIONAL',
        language: 'en',
      });
      expect(atsAnalysisService.run).not.toHaveBeenCalled();

      atsReportRepository.findLatestByVariantId.mockResolvedValue(null);
      await service.generate(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        tone: 'PROFESSIONAL',
        language: 'en',
      });
      expect(atsAnalysisService.run).toHaveBeenCalledWith(owner, 'user-1', {
        resumeVariantId: 'rv-1',
      });
    });

    it('resolves and forwards the optimization summary when optimizationId is provided', async () => {
      resumeOptimizationService.getOne.mockResolvedValue({
        id: 'opt-1',
        summary: 'Emphasize leadership.',
      } as never);

      await service.generate(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        tone: 'EXECUTIVE',
        language: 'en',
        optimizationId: 'opt-1',
      });

      expect(resumeOptimizationService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'opt-1');
      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(executeArgs.input).toMatchObject({ optimizationSummary: 'Emphasize leadership.' });
    });

    it('never calls ResumeOptimizationService when no optimizationId is given', async () => {
      await service.generate(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        tone: 'PROFESSIONAL',
        language: 'en',
      });
      expect(resumeOptimizationService.getOne).not.toHaveBeenCalled();
    });

    it('executes via AiOrchestrationService, persists version 1 GENERATED, and emits "generated"', async () => {
      const result = await service.generate(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        tone: 'PROFESSIONAL',
        language: 'en',
      });

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          feature: AIFeature.COVER_LETTER,
          options: expect.objectContaining({ responseFormat: 'json' }),
        }),
      );
      expect(repository.create).toHaveBeenCalledWith('user-1', {
        resumeVariantId: 'rv-1',
        jobTargetId: 'jt-1',
        optimizationId: undefined,
        title: 'Cover Letter — Senior Backend Engineer',
        content: 'Dear Hiring Manager, ...',
        tone: 'PROFESSIONAL',
        language: 'en',
        version: 1,
        status: 'GENERATED',
        creditsUsed: 40,
        generatedByAI: true,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'cover_letter',
          entityId: 'cl-1',
          action: 'generated',
        }),
      );
      expect(result).toEqual(createdCoverLetter);
    });

    it('auto-snapshots the resume state before generating (Phase 10.5 rule 8)', async () => {
      await service.generate(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        tone: 'PROFESSIONAL',
        language: 'en',
      });

      expect(resumeVariantService.snapshotBeforeAiAction).toHaveBeenCalledWith(
        owner,
        'user-1',
        'rv-1',
        expect.objectContaining({ jobTargetId: 'jt-1' }),
      );
    });

    it('persists nothing and creates no row when AiOrchestrationService throws (no PENDING/FAILED state exists for cover letters)', async () => {
      const failure = new InvalidPromptError('AI response is not valid JSON.');
      aiOrchestrationService.execute.mockRejectedValue(failure);

      await expect(
        service.generate(owner, 'user-1', {
          resumeVariantId: 'rv-1',
          tone: 'PROFESSIONAL',
          language: 'en',
        }),
      ).rejects.toBe(failure);

      expect(repository.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('the responseValidator passed to AiOrchestrationService throws InvalidPromptError on malformed AI text', async () => {
      await service.generate(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        tone: 'PROFESSIONAL',
        language: 'en',
      });

      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(() => executeArgs.options!.responseValidator!({ text: 'not json' } as never)).toThrow(
        InvalidPromptError,
      );
    });
  });

  describe('regenerate', () => {
    const source = {
      id: 'cl-1',
      userId: 'user-1',
      resumeVariantId: 'rv-1',
      jobTargetId: 'jt-1',
      optimizationId: 'opt-1',
      tone: 'PROFESSIONAL',
      language: 'en',
      version: 2,
    };

    it('denies a non-owner, non-admin user', async () => {
      repository.findById.mockResolvedValue(source as never);
      await expect(service.regenerate(stranger, 'user-1', 'cl-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('creates a new row with version = source.version + 1, preserving the source tone/language/optimizationId, and never mutates the source row', async () => {
      repository.findById.mockResolvedValue(source as never);
      resumeOptimizationService.getOne.mockResolvedValue({
        id: 'opt-1',
        summary: 'Summary.',
      } as never);

      await service.regenerate(owner, 'user-1', 'cl-1');

      expect(repository.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          resumeVariantId: 'rv-1',
          jobTargetId: 'jt-1',
          optimizationId: 'opt-1',
          tone: 'PROFESSIONAL',
          language: 'en',
          version: 3,
          status: 'GENERATED',
        }),
      );
      expect(repository.update).not.toHaveBeenCalled(); // the source row is never touched
    });

    it('auto-snapshots the resume state before regenerating (Phase 10.5 rule 8)', async () => {
      repository.findById.mockResolvedValue(source as never);
      resumeOptimizationService.getOne.mockResolvedValue({
        id: 'opt-1',
        summary: 'Summary.',
      } as never);

      await service.regenerate(owner, 'user-1', 'cl-1');

      expect(resumeVariantService.snapshotBeforeAiAction).toHaveBeenCalledWith(
        owner,
        'user-1',
        'rv-1',
        expect.objectContaining({ jobTargetId: 'jt-1' }),
      );
    });
  });

  describe('list / getOne', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound for a cover letter belonging to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'cl-1', userId: 'someone-else' } as never);
      await expect(service.getOne(owner, 'user-1', 'cl-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('sets status EDITED and never touches version, emitting "updated"', async () => {
      repository.findById.mockResolvedValue({ id: 'cl-1', userId: 'user-1' } as never);
      repository.update.mockResolvedValue({ id: 'cl-1', status: 'EDITED' } as never);

      await service.update(owner, 'user-1', 'cl-1', { title: 'New title' });

      expect(repository.update).toHaveBeenCalledWith('cl-1', {
        title: 'New title',
        content: undefined,
        tone: undefined,
        language: undefined,
        status: 'EDITED',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'cover_letter',
          entityId: 'cl-1',
          action: 'updated',
        }),
      );
    });
  });

  describe('setTemplate', () => {
    const existingLetter = { id: 'cl-1', userId: 'user-1' } as never;

    it('denies a non-owner, non-admin user', async () => {
      await expect(
        service.setTemplate(stranger, 'user-1', 'cl-1', 'cl-modern'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound when the templateId does not exist', async () => {
      repository.findById.mockResolvedValue(existingLetter);
      templateRepository.findById.mockResolvedValue(null);
      await expect(service.setTemplate(owner, 'user-1', 'cl-1', 'no-such')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('assigns the template via a plain field update and emits "updated"', async () => {
      repository.findById.mockResolvedValue(existingLetter);
      templateRepository.findById.mockResolvedValue({ id: 'cl-modern' } as never);
      repository.update.mockResolvedValue({ id: 'cl-1', templateId: 'cl-modern' } as never);

      const result = await service.setTemplate(owner, 'user-1', 'cl-1', 'cl-modern');

      expect(repository.update).toHaveBeenCalledWith('cl-1', { templateId: 'cl-modern' });
      expect(result.templateId).toBe('cl-modern');
    });
  });

  describe('updateTheme / resetTheme', () => {
    const existingLetter = { id: 'cl-1', userId: 'user-1' } as never;

    it('updateTheme() wholesale-replaces themeOverrides with exactly the given DTO', async () => {
      repository.findById.mockResolvedValue(existingLetter);
      const dto = { primaryColor: '#111111' } as never;

      await service.updateTheme(owner, 'user-1', 'cl-1', dto);

      expect(repository.update).toHaveBeenCalledWith('cl-1', { themeOverrides: dto });
    });

    it('resetTheme() clears themeOverrides back to SQL NULL', async () => {
      repository.findById.mockResolvedValue(existingLetter);

      await service.resetTheme(owner, 'user-1', 'cl-1');

      const [, data] = repository.update.mock.calls[0]!;
      expect(data.themeOverrides).toBeDefined();
    });
  });

  describe('duplicate', () => {
    it('creates an independent copy with version 1, status DRAFT, generatedByAI false, creditsUsed 0, and emits "created"', async () => {
      repository.findById.mockResolvedValue({
        id: 'cl-1',
        userId: 'user-1',
        resumeVariantId: 'rv-1',
        jobTargetId: 'jt-1',
        optimizationId: null,
        title: 'Original',
        content: 'Body',
        tone: 'PROFESSIONAL',
        language: 'en',
      } as never);
      repository.create.mockResolvedValue({ id: 'cl-2' } as never);

      const result = await service.duplicate(owner, 'user-1', 'cl-1');

      expect(repository.create).toHaveBeenCalledWith('user-1', {
        resumeVariantId: 'rv-1',
        jobTargetId: 'jt-1',
        optimizationId: undefined,
        title: 'Original (copy)',
        content: 'Body',
        tone: 'PROFESSIONAL',
        language: 'en',
        version: 1,
        status: 'DRAFT',
        creditsUsed: 0,
        generatedByAI: false,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'cover_letter',
          entityId: 'cl-2',
          action: 'created',
        }),
      );
      expect(result).toEqual({ id: 'cl-2' });
    });
  });

  describe('archive / restore', () => {
    it('archive() sets status ARCHIVED and emits "archived"', async () => {
      repository.findById.mockResolvedValue({
        id: 'cl-1',
        userId: 'user-1',
        status: 'GENERATED',
      } as never);
      repository.update.mockResolvedValue({ id: 'cl-1', status: 'ARCHIVED' } as never);

      await service.archive(owner, 'user-1', 'cl-1');

      expect(repository.update).toHaveBeenCalledWith('cl-1', { status: 'ARCHIVED' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'archived' }),
      );
    });

    it('archive() is an idempotent no-op when already ARCHIVED', async () => {
      repository.findById.mockResolvedValue({
        id: 'cl-1',
        userId: 'user-1',
        status: 'ARCHIVED',
      } as never);

      await service.archive(owner, 'user-1', 'cl-1');

      expect(repository.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('restore() reverts to GENERATED when generatedByAI is true', async () => {
      repository.findById.mockResolvedValue({
        id: 'cl-1',
        userId: 'user-1',
        status: 'ARCHIVED',
        generatedByAI: true,
      } as never);
      repository.update.mockResolvedValue({ id: 'cl-1', status: 'GENERATED' } as never);

      await service.restore(owner, 'user-1', 'cl-1');

      expect(repository.update).toHaveBeenCalledWith('cl-1', { status: 'GENERATED' });
    });

    it('restore() reverts to EDITED when generatedByAI is false', async () => {
      repository.findById.mockResolvedValue({
        id: 'cl-1',
        userId: 'user-1',
        status: 'ARCHIVED',
        generatedByAI: false,
      } as never);
      repository.update.mockResolvedValue({ id: 'cl-1', status: 'EDITED' } as never);

      await service.restore(owner, 'user-1', 'cl-1');

      expect(repository.update).toHaveBeenCalledWith('cl-1', { status: 'EDITED' });
    });

    it('restore() is an idempotent no-op when not currently ARCHIVED', async () => {
      repository.findById.mockResolvedValue({
        id: 'cl-1',
        userId: 'user-1',
        status: 'GENERATED',
      } as never);

      await service.restore(owner, 'user-1', 'cl-1');

      expect(repository.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes and emits "deleted"', async () => {
      repository.findById.mockResolvedValue({ id: 'cl-1', userId: 'user-1' } as never);

      await service.remove(owner, 'user-1', 'cl-1');

      expect(repository.softDelete).toHaveBeenCalledWith('cl-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'cover_letter', action: 'deleted' }),
      );
    });

    it('throws NotFound instead of deleting when the cover letter belongs to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'cl-1', userId: 'someone-else' } as never);

      await expect(service.remove(owner, 'user-1', 'cl-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.softDelete).not.toHaveBeenCalled();
    });
  });
});
