import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AtsAiService } from './ats-ai.service';
import type { AtsAiRepository } from './ats-ai.repository';
import type { AtsAnalysisService } from '../ats/ats-analysis.service';
import type { ResumeVariantService } from '../resume-variant/resume-variant.service';
import type { JobTargetService } from '../job-target/job-target.service';
import type { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';

describe('AtsAiService', () => {
  let repository: jest.Mocked<AtsAiRepository>;
  let atsAnalysisService: jest.Mocked<AtsAnalysisService>;
  let resumeVariantService: jest.Mocked<ResumeVariantService>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let aiOrchestrationService: jest.Mocked<AiOrchestrationService>;
  let service: AtsAiService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const report = {
    id: 'report-1',
    userId: 'user-1',
    resumeVariantId: 'variant-1',
    jobTargetId: 'jt-1',
    overallScore: 62,
    keywordScore: 55,
    skillsScore: 70,
    experienceScore: 60,
    educationScore: 80,
    languageScore: 90,
    formattingScore: 65,
    completionScore: 75,
    matchedKeywords: ['TypeScript'],
    missingKeywords: ['Kubernetes'],
    recommendedSkills: ['Docker'],
    recommendations: ['Add more quantified achievements.'],
  };

  const variant = { id: 'variant-1', title: 'My Resume' };
  const jobTarget = {
    id: 'jt-1',
    title: 'Senior Backend Engineer',
    company: 'Acme Corp',
    seniority: 'Senior',
    keywords: [{ keyword: 'Kubernetes' }],
    skills: [{ skill: 'Docker' }],
    languages: [{ language: 'English' }],
  };

  const validAiResponse = JSON.stringify({
    overallAssessment: 'Moderate match.',
    strengths: ['Strong TypeScript experience'],
    priorityIssues: [
      { priority: 'HIGH', category: 'Keywords', explanation: 'E.', recommendation: 'R.' },
    ],
    contentRecommendations: [],
    sectionRecommendations: [],
    actionPlan: ['Add the missing keyword.'],
  });
  const createdAnalysis = { id: 'analysis-1', overallAssessment: 'Moderate match.' };

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(createdAnalysis),
      findAllByUserId: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<AtsAiRepository>;
    atsAnalysisService = {
      getOne: jest.fn().mockResolvedValue(report),
    } as unknown as jest.Mocked<AtsAnalysisService>;
    resumeVariantService = {
      getOne: jest.fn().mockResolvedValue(variant),
    } as unknown as jest.Mocked<ResumeVariantService>;
    jobTargetService = {
      getOne: jest.fn().mockResolvedValue(jobTarget),
    } as unknown as jest.Mocked<JobTargetService>;
    aiOrchestrationService = {
      execute: jest
        .fn()
        .mockResolvedValue({ text: validAiResponse, creditsCharged: 30, aiRequestId: 'ai-req-1' }),
    } as unknown as jest.Mocked<AiOrchestrationService>;

    service = new AtsAiService(
      repository,
      atsAnalysisService,
      resumeVariantService,
      jobTargetService,
      aiOrchestrationService,
    );
  });

  describe('analyze', () => {
    it('denies a non-owner, non-admin user before touching the ATS report', async () => {
      await expect(
        service.analyze(stranger, 'user-1', { atsReportId: 'report-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(atsAnalysisService.getOne).not.toHaveBeenCalled();
      expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    });

    it('loads the report via AtsAnalysisService.getOne() — ownership-checked, never a raw repository read', async () => {
      await service.analyze(owner, 'user-1', { atsReportId: 'report-1' });
      expect(atsAnalysisService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'report-1');
    });

    it('never recalculates ATS scores/keywords — passes AtsReport data through to the prompt unchanged', async () => {
      await service.analyze(owner, 'user-1', { atsReportId: 'report-1' });

      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      const input = executeArgs.input as { context: { atsReport: typeof report } };
      expect(input.context.atsReport).toEqual(
        expect.objectContaining({
          overallScore: 62,
          matchedKeywords: ['TypeScript'],
          missingKeywords: ['Kubernetes'],
          recommendedSkills: ['Docker'],
        }),
      );
    });

    it('executes via AiOrchestrationService with the ATS_AI feature and a fresh idempotency key', async () => {
      await service.analyze(owner, 'user-1', { atsReportId: 'report-1' });

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          feature: AIFeature.ATS_AI,
          idempotencyKey: expect.stringMatching(/^ats-ai:user-1:/),
          options: expect.objectContaining({ responseFormat: 'json' }),
        }),
      );
    });

    it('persists the parsed response with the credits actually charged, the aiRequestId, and the atsReportId', async () => {
      const result = await service.analyze(owner, 'user-1', { atsReportId: 'report-1' });

      expect(repository.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          atsReportId: 'report-1',
          overallAssessment: 'Moderate match.',
          strengths: ['Strong TypeScript experience'],
          actionPlan: ['Add the missing keyword.'],
          creditsUsed: 30,
          aiRequestId: 'ai-req-1',
        }),
      );
      expect(result).toEqual(createdAnalysis);
    });

    it('never calls CreditService/credit logic directly — only AiOrchestrationService.execute()', async () => {
      // No CreditService is injected into AtsAiService at all — this test
      // documents that constraint via the constructor signature itself
      // (see ats-ai.module.ts) rather than a runtime spy, since there is
      // nothing to spy on: the class has no such dependency.
      await service.analyze(owner, 'user-1', { atsReportId: 'report-1' });
      expect(aiOrchestrationService.execute).toHaveBeenCalledTimes(1);
    });

    it('propagates the error and persists nothing when AiOrchestrationService throws (refund already handled inside the pipeline)', async () => {
      const failure = new InvalidPromptError('AI response is not valid JSON.');
      aiOrchestrationService.execute.mockRejectedValue(failure);

      await expect(service.analyze(owner, 'user-1', { atsReportId: 'report-1' })).rejects.toBe(
        failure,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('the responseValidator passed to AiOrchestrationService throws InvalidPromptError on malformed AI text', async () => {
      await service.analyze(owner, 'user-1', { atsReportId: 'report-1' });

      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(() => executeArgs.options!.responseValidator!({ text: 'not json' } as never)).toThrow(
        InvalidPromptError,
      );
    });

    it('persists a lightweight contextSnapshot (counts only), never the raw keyword/skill content', async () => {
      await service.analyze(owner, 'user-1', { atsReportId: 'report-1' });

      const [, data] = repository.create.mock.calls[0]!;
      expect(data.contextSnapshot).toEqual({
        matchedKeywordsCount: 1,
        missingKeywordsCount: 1,
        recommendedSkillsCount: 1,
      });
    });

    it('propagates NotFoundException from AtsAnalysisService.getOne() for an invalid or cross-user report id', async () => {
      atsAnalysisService.getOne.mockRejectedValue(new NotFoundException('ATS report not found.'));

      await expect(
        service.analyze(owner, 'user-1', { atsReportId: 'not-real' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    });
  });

  describe('list / getOne', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound for an analysis belonging to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'analysis-1', userId: 'someone-else' } as never);
      await expect(service.getOne(owner, 'user-1', 'analysis-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the analysis when it belongs to the requesting user', async () => {
      repository.findById.mockResolvedValue({ id: 'analysis-1', userId: 'user-1' } as never);
      const result = await service.getOne(owner, 'user-1', 'analysis-1');
      expect(result).toEqual({ id: 'analysis-1', userId: 'user-1' });
    });
  });
});
