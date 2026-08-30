import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CareerAdvisorService } from './career-advisor.service';
import type { CareerAdvisorRepository } from './career-advisor.repository';
import type { ProfileService } from '../profile/profile.service';
import type { MasterResumeService } from '../master-resume/master-resume.service';
import type { ResumeSectionsService } from '../resume-sections/resume-sections.service';
import type { JobTargetService } from '../job-target/job-target.service';
import type { ResumeVariantService } from '../resume-variant/resume-variant.service';
import type { ApplicationService } from '../application/application.service';
import type { AtsReportRepository } from '../ats/ats-report.repository';
import type { InterviewService } from '../interview/interview.service';
import type { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';

describe('CareerAdvisorService', () => {
  let repository: jest.Mocked<CareerAdvisorRepository>;
  let profileService: jest.Mocked<ProfileService>;
  let masterResumeService: jest.Mocked<MasterResumeService>;
  let resumeSectionsService: jest.Mocked<ResumeSectionsService>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let resumeVariantService: jest.Mocked<ResumeVariantService>;
  let applicationService: jest.Mocked<ApplicationService>;
  let atsReportRepository: jest.Mocked<AtsReportRepository>;
  let interviewService: jest.Mocked<InterviewService>;
  let aiOrchestrationService: jest.Mocked<AiOrchestrationService>;
  let service: CareerAdvisorService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const validAiResponse = JSON.stringify({
    summary: 'Focus on X.',
    currentAssessment: 'You are on track.',
    strengths: ['Strong TypeScript'],
    gaps: ['No leadership experience'],
    recommendations: ['Seek a tech-lead role'],
    nextSteps: ['Update your resume'],
  });
  const createdAdvice = { id: 'ca-1', question: 'What should I focus on next?' };

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(createdAdvice),
      findAllByUserId: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<CareerAdvisorRepository>;
    profileService = {
      getForUser: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<ProfileService>;
    masterResumeService = {
      getForUser: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<MasterResumeService>;
    resumeSectionsService = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ResumeSectionsService>;
    jobTargetService = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<JobTargetService>;
    resumeVariantService = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ResumeVariantService>;
    applicationService = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ApplicationService>;
    atsReportRepository = {
      findAllByUserId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<AtsReportRepository>;
    interviewService = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<InterviewService>;
    aiOrchestrationService = {
      execute: jest
        .fn()
        .mockResolvedValue({ text: validAiResponse, creditsCharged: 30, aiRequestId: 'ai-req-1' }),
    } as unknown as jest.Mocked<AiOrchestrationService>;

    service = new CareerAdvisorService(
      repository,
      profileService,
      masterResumeService,
      resumeSectionsService,
      jobTargetService,
      resumeVariantService,
      applicationService,
      atsReportRepository,
      interviewService,
      aiOrchestrationService,
    );
  });

  describe('requestAdvice', () => {
    it('denies a non-owner, non-admin user before gathering any context', async () => {
      await expect(
        service.requestAdvice(stranger, 'user-1', { question: 'What should I focus on next?' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(profileService.getForUser).not.toHaveBeenCalled();
      expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    });

    it('executes via AiOrchestrationService with the CAREER_ADVISOR feature and a fresh idempotency key', async () => {
      await service.requestAdvice(owner, 'user-1', { question: 'What should I focus on next?' });

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          feature: AIFeature.CAREER_ADVISOR,
          idempotencyKey: expect.stringMatching(/^career-advisor:user-1:/),
          options: expect.objectContaining({ responseFormat: 'json' }),
        }),
      );
    });

    it('persists the parsed response with the credits actually charged and the aiRequestId', async () => {
      const result = await service.requestAdvice(owner, 'user-1', {
        question: 'What should I focus on next?',
      });

      expect(repository.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          question: 'What should I focus on next?',
          summary: 'Focus on X.',
          currentAssessment: 'You are on track.',
          strengths: ['Strong TypeScript'],
          gaps: ['No leadership experience'],
          recommendations: ['Seek a tech-lead role'],
          nextSteps: ['Update your resume'],
          creditsUsed: 30,
          aiRequestId: 'ai-req-1',
        }),
      );
      expect(result).toEqual(createdAdvice);
    });

    it('never calls CreditService/credit logic directly — only AiOrchestrationService.execute()', async () => {
      // No CreditService is injected into CareerAdvisorService at all — this
      // test documents that constraint via the constructor signature itself
      // (see career-advisor.module.ts) rather than a runtime spy, since
      // there is nothing to spy on: the class has no such dependency.
      await service.requestAdvice(owner, 'user-1', { question: 'Q' });
      expect(aiOrchestrationService.execute).toHaveBeenCalledTimes(1);
    });

    it('propagates the error and persists nothing when AiOrchestrationService throws (refund already handled inside the pipeline)', async () => {
      const failure = new InvalidPromptError('AI response is not valid JSON.');
      aiOrchestrationService.execute.mockRejectedValue(failure);

      await expect(service.requestAdvice(owner, 'user-1', { question: 'Q' })).rejects.toBe(failure);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('the responseValidator passed to AiOrchestrationService throws InvalidPromptError on malformed AI text', async () => {
      await service.requestAdvice(owner, 'user-1', { question: 'Q' });

      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(() => executeArgs.options!.responseValidator!({ text: 'not json' } as never)).toThrow(
        InvalidPromptError,
      );
    });

    describe('context gathering', () => {
      it('works with zero optional data — profile, master resume, and every list empty — and never throws', async () => {
        await expect(
          service.requestAdvice(owner, 'user-1', { question: 'How can I improve?' }),
        ).resolves.toBeDefined();

        expect(resumeSectionsService.list).not.toHaveBeenCalled();
        const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
        const input = executeArgs.input as { context: { profile: unknown; masterResume: unknown } };
        expect(input.context.profile).toBeNull();
        expect(input.context.masterResume).toBeNull();
      });

      it('only fetches the 3 resume sections (work-experience/education/skills) when a MasterResume exists', async () => {
        masterResumeService.getForUser.mockResolvedValue({
          title: 'Backend Engineer',
          summary: null,
          careerLevel: null,
          yearsExperience: null,
          desiredPosition: null,
          completionPercentage: 40,
        } as never);

        await service.requestAdvice(owner, 'user-1', { question: 'Q' });

        expect(resumeSectionsService.list).toHaveBeenCalledWith('work-experience', owner, 'user-1');
        expect(resumeSectionsService.list).toHaveBeenCalledWith('education', owner, 'user-1');
        expect(resumeSectionsService.list).toHaveBeenCalledWith('skills', owner, 'user-1');
        expect(resumeSectionsService.list).toHaveBeenCalledTimes(3);
      });

      it('cross-references applications with job targets to resolve jobTargetTitle without a backend join', async () => {
        jobTargetService.list.mockResolvedValue([{ id: 'jt-1', title: 'Staff Engineer' } as never]);
        applicationService.list.mockResolvedValue([
          { jobTargetId: 'jt-1', status: 'APPLIED' } as never,
        ]);

        await service.requestAdvice(owner, 'user-1', { question: 'Q' });

        const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
        const input = executeArgs.input as {
          context: { applications: Array<{ jobTargetTitle: string }> };
        };
        expect(input.context.applications).toEqual([
          { jobTargetTitle: 'Staff Engineer', status: 'APPLIED' },
        ]);
      });

      it('persists a lightweight contextSnapshot (booleans/counts only), never the raw resume/job target content', async () => {
        masterResumeService.getForUser.mockResolvedValue({
          title: 'T',
          summary: null,
          careerLevel: null,
          yearsExperience: null,
          desiredPosition: null,
          completionPercentage: 40,
        } as never);
        jobTargetService.list.mockResolvedValue([{ id: 'jt-1', title: 'Staff Engineer' } as never]);

        await service.requestAdvice(owner, 'user-1', { question: 'Q' });

        const [, data] = repository.create.mock.calls[0]!;
        expect(data.contextSnapshot).toEqual(
          expect.objectContaining({ hasMasterResume: true, jobTargetsCount: 1 }),
        );
        expect(JSON.stringify(data.contextSnapshot)).not.toContain('Staff Engineer');
      });
    });
  });

  describe('list / getOne', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound for an advice belonging to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'ca-1', userId: 'someone-else' } as never);
      await expect(service.getOne(owner, 'user-1', 'ca-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the advice when it belongs to the requesting user', async () => {
      repository.findById.mockResolvedValue({ id: 'ca-1', userId: 'user-1' } as never);
      const result = await service.getOne(owner, 'user-1', 'ca-1');
      expect(result).toEqual({ id: 'ca-1', userId: 'user-1' });
    });
  });
});
