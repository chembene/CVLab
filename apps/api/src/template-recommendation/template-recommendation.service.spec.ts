import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TemplateRecommendationService } from './template-recommendation.service';
import type { TemplateRecommendationRepository } from './template-recommendation.repository';
import type { MasterResumeService } from '../master-resume/master-resume.service';
import type { ResumeSectionsService } from '../resume-sections/resume-sections.service';
import type { ResumeVariantService } from '../resume-variant/resume-variant.service';
import type { JobTargetService } from '../job-target/job-target.service';
import type { ResumeTemplateRepository } from '../template-engine/resume-template.repository';
import type { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';

describe('TemplateRecommendationService', () => {
  let repository: jest.Mocked<TemplateRecommendationRepository>;
  let masterResumeService: jest.Mocked<MasterResumeService>;
  let resumeSectionsService: jest.Mocked<ResumeSectionsService>;
  let resumeVariantService: jest.Mocked<ResumeVariantService>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let resumeTemplateRepository: jest.Mocked<ResumeTemplateRepository>;
  let aiOrchestrationService: jest.Mocked<AiOrchestrationService>;
  let service: TemplateRecommendationService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const templates = [
    { id: 'tpl-1', name: 'Classic', category: 'ATS_CLASSIC', isATSFriendly: true, premium: false },
    {
      id: 'tpl-2',
      name: 'Developer Dark',
      category: 'DEVELOPER',
      isATSFriendly: true,
      premium: true,
    },
  ];

  const validAiResponse = JSON.stringify({
    summary: 'These templates suit your profile.',
    templateRecommendations: [
      { templateId: 'tpl-2', rank: 2, score: 70, reason: 'Good for developers.' },
      { templateId: 'tpl-1', rank: 1, score: 90, reason: 'ATS-friendly and safe.' },
    ],
  });
  const createdRecommendation = { id: 'rec-1', summary: 'These templates suit your profile.' };

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(createdRecommendation),
      findAllByUserId: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<TemplateRecommendationRepository>;
    masterResumeService = {
      getForUser: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<MasterResumeService>;
    resumeSectionsService = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ResumeSectionsService>;
    resumeVariantService = { getOne: jest.fn() } as unknown as jest.Mocked<ResumeVariantService>;
    jobTargetService = { getOne: jest.fn() } as unknown as jest.Mocked<JobTargetService>;
    resumeTemplateRepository = {
      findAll: jest.fn().mockResolvedValue(templates),
    } as unknown as jest.Mocked<ResumeTemplateRepository>;
    aiOrchestrationService = {
      execute: jest
        .fn()
        .mockResolvedValue({ text: validAiResponse, creditsCharged: 20, aiRequestId: 'ai-req-1' }),
    } as unknown as jest.Mocked<AiOrchestrationService>;

    service = new TemplateRecommendationService(
      repository,
      masterResumeService,
      resumeSectionsService,
      resumeVariantService,
      jobTargetService,
      resumeTemplateRepository,
      aiOrchestrationService,
    );
  });

  describe('recommend', () => {
    it('denies a non-owner, non-admin user before gathering any context', async () => {
      await expect(service.recommend(stranger, 'user-1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(masterResumeService.getForUser).not.toHaveBeenCalled();
      expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    });

    it('executes via AiOrchestrationService with the TEMPLATE_RECOMMENDATION feature and a fresh idempotency key', async () => {
      await service.recommend(owner, 'user-1', {});

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          feature: AIFeature.TEMPLATE_RECOMMENDATION,
          idempotencyKey: expect.stringMatching(/^template-recommendation:user-1:/),
          options: expect.objectContaining({ responseFormat: 'json' }),
        }),
      );
    });

    it('re-ranks recommendations 1..N in score/rank order after validating template ids, and persists them', async () => {
      const result = await service.recommend(owner, 'user-1', {});

      expect(repository.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          summary: 'These templates suit your profile.',
          recommendations: [
            { templateId: 'tpl-1', rank: 1, score: 90, reason: 'ATS-friendly and safe.' },
            { templateId: 'tpl-2', rank: 2, score: 70, reason: 'Good for developers.' },
          ],
          creditsUsed: 20,
          aiRequestId: 'ai-req-1',
        }),
      );
      expect(result).toEqual(createdRecommendation);
    });

    it('drops recommendations that reference a nonexistent templateId, keeping only real ones', async () => {
      aiOrchestrationService.execute.mockResolvedValue({
        text: JSON.stringify({
          summary: 'Mixed response.',
          templateRecommendations: [
            { templateId: 'tpl-1', rank: 1, score: 90, reason: 'Real.' },
            { templateId: 'does-not-exist', rank: 2, score: 80, reason: 'Fake.' },
          ],
        }),
        creditsCharged: 20,
        aiRequestId: 'ai-req-1',
      } as never);

      await service.recommend(owner, 'user-1', {});

      const [, data] = repository.create.mock.calls[0]!;
      expect(data.recommendations).toEqual([
        { templateId: 'tpl-1', rank: 1, score: 90, reason: 'Real.' },
      ]);
    });

    it('throws InvalidPromptError (triggering the same automatic refund as any other pipeline failure) when every templateId is fake', async () => {
      aiOrchestrationService.execute.mockImplementation(async (args) => {
        // Mirror AiOrchestrationService's own "Validate Response" step
        // calling responseValidator before this mock resolves — proves the
        // all-fake-ids case is caught inside the validator, not after.
        args.options!.responseValidator!({
          text: JSON.stringify({
            summary: 'All fake.',
            templateRecommendations: [
              { templateId: 'does-not-exist', rank: 1, score: 90, reason: 'Fake.' },
            ],
          }),
        } as never);
        return { text: '', creditsCharged: 0, aiRequestId: '' } as never;
      });

      await expect(service.recommend(owner, 'user-1', {})).rejects.toBeInstanceOf(
        InvalidPromptError,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('never calls CreditService/credit logic directly — only AiOrchestrationService.execute()', async () => {
      await service.recommend(owner, 'user-1', {});
      expect(aiOrchestrationService.execute).toHaveBeenCalledTimes(1);
    });

    it('propagates the error and persists nothing when AiOrchestrationService throws (refund already handled inside the pipeline)', async () => {
      const failure = new InvalidPromptError('AI response is not valid JSON.');
      aiOrchestrationService.execute.mockRejectedValue(failure);

      await expect(service.recommend(owner, 'user-1', {})).rejects.toBe(failure);
      expect(repository.create).not.toHaveBeenCalled();
    });

    describe('context gathering', () => {
      it('works with zero optional data — no Resume Variant, no Job Target, no Master Resume — and never throws', async () => {
        await expect(service.recommend(owner, 'user-1', {})).resolves.toBeDefined();

        expect(resumeVariantService.getOne).not.toHaveBeenCalled();
        expect(jobTargetService.getOne).not.toHaveBeenCalled();
        expect(resumeSectionsService.list).not.toHaveBeenCalled();
      });

      it('fetches the given Resume Variant and derives its Job Target when none is given explicitly', async () => {
        resumeVariantService.getOne.mockResolvedValue({
          id: 'variant-1',
          title: 'My Variant',
          jobTargetId: 'jt-1',
        } as never);
        jobTargetService.getOne.mockResolvedValue({ id: 'jt-1', title: 'Staff Engineer' } as never);

        await service.recommend(owner, 'user-1', { resumeVariantId: 'variant-1' });

        expect(resumeVariantService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'variant-1');
        expect(jobTargetService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'jt-1');
      });

      it('an explicit jobTargetId takes precedence over the one derived from the Resume Variant', async () => {
        resumeVariantService.getOne.mockResolvedValue({
          id: 'variant-1',
          title: 'My Variant',
          jobTargetId: 'jt-from-variant',
        } as never);
        jobTargetService.getOne.mockResolvedValue({
          id: 'jt-explicit',
          title: 'Explicit Role',
        } as never);

        await service.recommend(owner, 'user-1', {
          resumeVariantId: 'variant-1',
          jobTargetId: 'jt-explicit',
        });

        expect(jobTargetService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'jt-explicit');
      });

      it('only fetches resume sections when a MasterResume exists', async () => {
        masterResumeService.getForUser.mockResolvedValue({
          title: 'Backend Engineer',
          summary: null,
          careerLevel: null,
          yearsExperience: null,
          desiredPosition: null,
        } as never);

        await service.recommend(owner, 'user-1', {});

        expect(resumeSectionsService.list).toHaveBeenCalledWith('work-experience', owner, 'user-1');
        expect(resumeSectionsService.list).toHaveBeenCalledWith('education', owner, 'user-1');
        expect(resumeSectionsService.list).toHaveBeenCalledWith('skills', owner, 'user-1');
        expect(resumeSectionsService.list).toHaveBeenCalledWith('languages', owner, 'user-1');
      });

      it('always loads the full active template catalog into context', async () => {
        await service.recommend(owner, 'user-1', {});
        expect(resumeTemplateRepository.findAll).toHaveBeenCalledWith({});
      });

      it('persists a lightweight contextSnapshot (counts/booleans only), never the raw template catalog', async () => {
        await service.recommend(owner, 'user-1', {});

        const [, data] = repository.create.mock.calls[0]!;
        expect(data.contextSnapshot).toEqual(
          expect.objectContaining({ hasMasterResume: false, availableTemplatesCount: 2 }),
        );
        expect(JSON.stringify(data.contextSnapshot)).not.toContain('Developer Dark');
      });
    });
  });

  describe('list / getOne', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound for a recommendation belonging to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'rec-1', userId: 'someone-else' } as never);
      await expect(service.getOne(owner, 'user-1', 'rec-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the recommendation when it belongs to the requesting user', async () => {
      repository.findById.mockResolvedValue({ id: 'rec-1', userId: 'user-1' } as never);
      const result = await service.getOne(owner, 'user-1', 'rec-1');
      expect(result).toEqual({ id: 'rec-1', userId: 'user-1' });
    });
  });
});
