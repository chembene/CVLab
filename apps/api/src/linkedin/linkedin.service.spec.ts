import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LinkedInService } from './linkedin.service';
import type { LinkedInRepository } from './linkedin.repository';
import type { ProfileService } from '../profile/profile.service';
import type { MasterResumeService } from '../master-resume/master-resume.service';
import type { ResumeSectionsService } from '../resume-sections/resume-sections.service';
import type { JobTargetService } from '../job-target/job-target.service';
import type { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';

describe('LinkedInService', () => {
  let repository: jest.Mocked<LinkedInRepository>;
  let profileService: jest.Mocked<ProfileService>;
  let masterResumeService: jest.Mocked<MasterResumeService>;
  let resumeSectionsService: jest.Mocked<ResumeSectionsService>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let aiOrchestrationService: jest.Mocked<AiOrchestrationService>;
  let service: LinkedInService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const validAiResponse = JSON.stringify({
    headline: 'Senior Backend Engineer',
    about: 'About section.',
    skills: ['TypeScript'],
    experienceSuggestions: ['Led the backend team.'],
    recommendations: ['Add a profile photo.'],
  });
  const createdProfile = { id: 'lp-1', headline: 'Senior Backend Engineer' };

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(createdProfile),
      findAllByUserId: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<LinkedInRepository>;
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
    aiOrchestrationService = {
      execute: jest
        .fn()
        .mockResolvedValue({ text: validAiResponse, creditsCharged: 30, aiRequestId: 'ai-req-1' }),
    } as unknown as jest.Mocked<AiOrchestrationService>;

    service = new LinkedInService(
      repository,
      profileService,
      masterResumeService,
      resumeSectionsService,
      jobTargetService,
      aiOrchestrationService,
    );
  });

  describe('generateProfile', () => {
    it('denies a non-owner, non-admin user before gathering any context', async () => {
      await expect(service.generateProfile(stranger, 'user-1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(profileService.getForUser).not.toHaveBeenCalled();
      expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    });

    it('executes via AiOrchestrationService with the LINKEDIN feature and a fresh idempotency key', async () => {
      await service.generateProfile(owner, 'user-1', { targetRole: 'Staff Engineer' });

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          feature: AIFeature.LINKEDIN,
          idempotencyKey: expect.stringMatching(/^linkedin:user-1:/),
          options: expect.objectContaining({ responseFormat: 'json' }),
        }),
      );
      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      const input = executeArgs.input as { targetRole: string | null };
      expect(input.targetRole).toBe('Staff Engineer');
    });

    it('passes targetRole null when none is given', async () => {
      await service.generateProfile(owner, 'user-1', {});
      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      const input = executeArgs.input as { targetRole: string | null };
      expect(input.targetRole).toBeNull();
    });

    it('persists the parsed response with the credits actually charged and the aiRequestId', async () => {
      const result = await service.generateProfile(owner, 'user-1', {
        targetRole: 'Staff Engineer',
      });

      expect(repository.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          targetRole: 'Staff Engineer',
          headline: 'Senior Backend Engineer',
          about: 'About section.',
          skills: ['TypeScript'],
          experienceSuggestions: ['Led the backend team.'],
          recommendations: ['Add a profile photo.'],
          creditsUsed: 30,
          aiRequestId: 'ai-req-1',
        }),
      );
      expect(result).toEqual(createdProfile);
    });

    it('never calls CreditService/credit logic directly — only AiOrchestrationService.execute()', async () => {
      // No CreditService is injected into LinkedInService at all — this
      // test documents that constraint via the constructor signature itself
      // (see linkedin.module.ts) rather than a runtime spy, since there is
      // nothing to spy on: the class has no such dependency.
      await service.generateProfile(owner, 'user-1', {});
      expect(aiOrchestrationService.execute).toHaveBeenCalledTimes(1);
    });

    it('propagates the error and persists nothing when AiOrchestrationService throws (refund already handled inside the pipeline)', async () => {
      const failure = new InvalidPromptError('AI response is not valid JSON.');
      aiOrchestrationService.execute.mockRejectedValue(failure);

      await expect(service.generateProfile(owner, 'user-1', {})).rejects.toBe(failure);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('the responseValidator passed to AiOrchestrationService throws InvalidPromptError on malformed AI text', async () => {
      await service.generateProfile(owner, 'user-1', {});

      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(() => executeArgs.options!.responseValidator!({ text: 'not json' } as never)).toThrow(
        InvalidPromptError,
      );
    });

    describe('context gathering', () => {
      it('works with zero optional data — profile, master resume, and every list empty — and never throws', async () => {
        await expect(service.generateProfile(owner, 'user-1', {})).resolves.toBeDefined();

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
        } as never);

        await service.generateProfile(owner, 'user-1', {});

        expect(resumeSectionsService.list).toHaveBeenCalledWith('work-experience', owner, 'user-1');
        expect(resumeSectionsService.list).toHaveBeenCalledWith('education', owner, 'user-1');
        expect(resumeSectionsService.list).toHaveBeenCalledWith('skills', owner, 'user-1');
        expect(resumeSectionsService.list).toHaveBeenCalledTimes(3);
      });

      it('persists a lightweight contextSnapshot (booleans/counts only), never the raw resume/job target content', async () => {
        masterResumeService.getForUser.mockResolvedValue({
          title: 'T',
          summary: null,
          careerLevel: null,
          yearsExperience: null,
          desiredPosition: null,
        } as never);
        jobTargetService.list.mockResolvedValue([{ id: 'jt-1', title: 'Staff Engineer' } as never]);

        await service.generateProfile(owner, 'user-1', {});

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

    it('throws NotFound for a profile belonging to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'lp-1', userId: 'someone-else' } as never);
      await expect(service.getOne(owner, 'user-1', 'lp-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the profile when it belongs to the requesting user', async () => {
      repository.findById.mockResolvedValue({ id: 'lp-1', userId: 'user-1' } as never);
      const result = await service.getOne(owner, 'user-1', 'lp-1');
      expect(result).toEqual({ id: 'lp-1', userId: 'user-1' });
    });
  });
});
