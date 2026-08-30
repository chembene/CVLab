import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { InterviewService } from './interview.service';
import type { InterviewRepository } from './interview.repository';
import type { ResumeVariantService } from '../resume-variant/resume-variant.service';
import type { JobTargetService } from '../job-target/job-target.service';
import type { AtsAnalysisService } from '../ats/ats-analysis.service';
import type { AtsReportRepository } from '../ats/ats-report.repository';
import type { ResumeOptimizationService } from '../resume-optimization/resume-optimization.service';
import type { CoverLetterService } from '../cover-letter/cover-letter.service';
import type { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';

describe('InterviewService', () => {
  let repository: jest.Mocked<InterviewRepository>;
  let resumeVariantService: jest.Mocked<ResumeVariantService>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let atsAnalysisService: jest.Mocked<AtsAnalysisService>;
  let atsReportRepository: jest.Mocked<AtsReportRepository>;
  let resumeOptimizationService: jest.Mocked<ResumeOptimizationService>;
  let coverLetterService: jest.Mocked<CoverLetterService>;
  let aiOrchestrationService: jest.Mocked<AiOrchestrationService>;
  let eventEmitter: { emit: jest.Mock };
  let service: InterviewService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const variant = { id: 'rv-1', jobTargetId: 'jt-1', content: { summary: 'x' } };
  const jobTarget = { id: 'jt-1', title: 'Senior Backend Engineer', keywords: [], skills: [] };
  const atsReport = { id: 'ats-1', resumeVariantId: 'rv-1', overallScore: 60 };
  const validQuestionsResponse = JSON.stringify({
    questions: [
      { category: 'TECHNICAL', question: 'Q1', idealAnswer: 'A1', tips: 'T1' },
      { category: 'BEHAVIORAL', question: 'Q2', idealAnswer: 'A2', tips: 'T2' },
    ],
  });
  const validEvaluationResponse = JSON.stringify({
    evaluations: [
      { score: 80, feedback: 'Good', strengths: ['s1'], improvements: ['i1'] },
      { score: 60, feedback: 'OK', strengths: ['s2'], improvements: ['i2'] },
    ],
  });

  const pendingSession = {
    id: 'session-1',
    userId: 'user-1',
    status: 'IN_PROGRESS',
    questions: [],
    mode: 'RESUME',
    resumeVariantId: 'rv-1',
    jobTargetId: 'jt-1',
  };

  beforeEach(() => {
    repository = {
      createSession: jest.fn().mockResolvedValue(pendingSession),
      findAllByUserId: jest.fn(),
      findById: jest.fn().mockResolvedValue(pendingSession),
      createQuestions: jest.fn(),
      findQuestionById: jest.fn(),
      upsertAnswer: jest.fn(),
      applyEvaluation: jest.fn(),
      completeSession: jest.fn(),
      softDeleteSession: jest.fn(),
    } as unknown as jest.Mocked<InterviewRepository>;
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
    coverLetterService = { getOne: jest.fn() } as unknown as jest.Mocked<CoverLetterService>;
    aiOrchestrationService = {
      execute: jest.fn().mockResolvedValue({ text: validQuestionsResponse, creditsCharged: 30 }),
    } as unknown as jest.Mocked<AiOrchestrationService>;
    eventEmitter = { emit: jest.fn() };

    service = new InterviewService(
      repository,
      resumeVariantService,
      jobTargetService,
      atsAnalysisService,
      atsReportRepository,
      resumeOptimizationService,
      coverLetterService,
      aiOrchestrationService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventEmitter as any,
    );
  });

  describe('start — mode RESUME', () => {
    it('denies a non-owner, non-admin user before touching the variant', async () => {
      await expect(
        service.start(stranger, 'user-1', {
          mode: 'RESUME',
          resumeVariantId: 'rv-1',
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(resumeVariantService.getOne).not.toHaveBeenCalled();
    });

    it('throws BadRequest when resumeVariantId is missing', async () => {
      await expect(
        service.start(owner, 'user-1', {
          mode: 'RESUME',
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(resumeVariantService.getOne).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the resume variant has no linked job target', async () => {
      resumeVariantService.getOne.mockResolvedValue({ ...variant, jobTargetId: null } as never);
      await expect(
        service.start(owner, 'user-1', {
          mode: 'RESUME',
          resumeVariantId: 'rv-1',
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('throws BadRequest when a JOB/ROLE-only field is supplied (e.g. role)', async () => {
      await expect(
        service.start(owner, 'user-1', {
          mode: 'RESUME',
          resumeVariantId: 'rv-1',
          role: 'Backend Developer',
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('verifies ownership of an optional optimizationId and coverLetterId before creating the session', async () => {
      resumeOptimizationService.getOne.mockResolvedValue({ id: 'opt-1' } as never);
      coverLetterService.getOne.mockResolvedValue({ id: 'cl-1' } as never);

      await service.start(owner, 'user-1', {
        mode: 'RESUME',
        resumeVariantId: 'rv-1',
        type: 'MIXED',
        difficulty: 'SENIOR',
        language: 'en',
        optimizationId: 'opt-1',
        coverLetterId: 'cl-1',
      });

      expect(resumeOptimizationService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'opt-1');
      expect(coverLetterService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'cl-1');
      expect(repository.createSession).toHaveBeenCalledWith('user-1', {
        mode: 'RESUME',
        resumeVariantId: 'rv-1',
        jobTargetId: 'jt-1',
        optimizationId: 'opt-1',
        coverLetterId: 'cl-1',
        type: 'MIXED',
        difficulty: 'SENIOR',
        language: 'en',
      });
    });

    it('creates the session and emits "started"', async () => {
      const result = await service.start(owner, 'user-1', {
        mode: 'RESUME',
        resumeVariantId: 'rv-1',
        type: 'MIXED',
        difficulty: 'SENIOR',
        language: 'en',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'interview',
          entityId: 'session-1',
          action: 'started',
        }),
      );
      expect(result).toEqual(pendingSession);
    });
  });

  describe('start — mode JOB', () => {
    it('creates a session with only a jobTargetId', async () => {
      await service.start(owner, 'user-1', {
        mode: 'JOB',
        jobTargetId: 'jt-1',
        type: 'MIXED',
        difficulty: 'SENIOR',
        language: 'en',
      });

      expect(jobTargetService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'jt-1');
      expect(resumeVariantService.getOne).not.toHaveBeenCalled();
      expect(repository.createSession).toHaveBeenCalledWith('user-1', {
        mode: 'JOB',
        resumeVariantId: undefined,
        jobTargetId: 'jt-1',
        jobDescription: undefined,
        optimizationId: undefined,
        coverLetterId: undefined,
        type: 'MIXED',
        difficulty: 'SENIOR',
        language: 'en',
      });
    });

    it('creates a session with only a jobDescription (trimmed), no CV required', async () => {
      await service.start(owner, 'user-1', {
        mode: 'JOB',
        jobDescription: '  We are hiring a backend engineer.  ',
        type: 'MIXED',
        difficulty: 'SENIOR',
        language: 'en',
      });

      expect(jobTargetService.getOne).not.toHaveBeenCalled();
      expect(resumeVariantService.getOne).not.toHaveBeenCalled();
      expect(repository.createSession).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          mode: 'JOB',
          jobDescription: 'We are hiring a backend engineer.',
        }),
      );
    });

    it('creates a session with both jobTargetId and jobDescription', async () => {
      await service.start(owner, 'user-1', {
        mode: 'JOB',
        jobTargetId: 'jt-1',
        jobDescription: 'Extra context.',
        type: 'MIXED',
        difficulty: 'SENIOR',
        language: 'en',
      });

      expect(repository.createSession).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          mode: 'JOB',
          jobTargetId: 'jt-1',
          jobDescription: 'Extra context.',
        }),
      );
    });

    it('accepts an optional resumeVariantId as extra context', async () => {
      await service.start(owner, 'user-1', {
        mode: 'JOB',
        jobTargetId: 'jt-1',
        resumeVariantId: 'rv-1',
        type: 'MIXED',
        difficulty: 'SENIOR',
        language: 'en',
      });

      expect(resumeVariantService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'rv-1');
      expect(repository.createSession).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ mode: 'JOB', resumeVariantId: 'rv-1' }),
      );
    });

    it('throws BadRequest when neither jobTargetId nor jobDescription is supplied', async () => {
      await expect(
        service.start(owner, 'user-1', {
          mode: 'JOB',
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('throws BadRequest when a ROLE-only field is supplied (e.g. industry)', async () => {
      await expect(
        service.start(owner, 'user-1', {
          mode: 'JOB',
          jobTargetId: 'jt-1',
          industry: 'Fintech',
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('throws BadRequest when optimizationId is supplied without a resumeVariantId', async () => {
      await expect(
        service.start(owner, 'user-1', {
          mode: 'JOB',
          jobTargetId: 'jt-1',
          optimizationId: 'opt-1',
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSession).not.toHaveBeenCalled();
    });
  });

  describe('start — mode ROLE', () => {
    it('creates a session with only a role', async () => {
      await service.start(owner, 'user-1', {
        mode: 'ROLE',
        role: 'Backend Developer',
        type: 'MIXED',
        difficulty: 'MID',
        language: 'pt-MZ',
      });

      expect(resumeVariantService.getOne).not.toHaveBeenCalled();
      expect(jobTargetService.getOne).not.toHaveBeenCalled();
      expect(repository.createSession).toHaveBeenCalledWith('user-1', {
        mode: 'ROLE',
        role: 'Backend Developer',
        industry: undefined,
        yearsExperience: undefined,
        companyName: undefined,
        type: 'MIXED',
        difficulty: 'MID',
        language: 'pt-MZ',
      });
    });

    it('creates a session with every optional field, trimming text fields', async () => {
      await service.start(owner, 'user-1', {
        mode: 'ROLE',
        role: '  Backend Developer  ',
        industry: 'Fintech',
        yearsExperience: 5,
        companyName: 'Acme',
        type: 'MIXED',
        difficulty: 'MID',
        language: 'pt-MZ',
      });

      expect(repository.createSession).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          mode: 'ROLE',
          role: 'Backend Developer',
          industry: 'Fintech',
          yearsExperience: 5,
          companyName: 'Acme',
        }),
      );
    });

    it('throws BadRequest when role is missing', async () => {
      await expect(
        service.start(owner, 'user-1', {
          mode: 'ROLE',
          type: 'MIXED',
          difficulty: 'MID',
          language: 'pt-MZ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('throws BadRequest when a RESUME/JOB-only field is supplied (e.g. resumeVariantId)', async () => {
      await expect(
        service.start(owner, 'user-1', {
          mode: 'ROLE',
          role: 'Backend Developer',
          resumeVariantId: 'rv-1',
          type: 'MIXED',
          difficulty: 'MID',
          language: 'pt-MZ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSession).not.toHaveBeenCalled();
    });
  });

  describe('generateQuestions', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(
        service.generateQuestions(stranger, 'user-1', 'session-1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequest when questions were already generated', async () => {
      repository.findById.mockResolvedValue({
        ...pendingSession,
        questions: [{ id: 'q-1' }],
      } as never);
      await expect(
        service.generateQuestions(owner, 'user-1', 'session-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    });

    it('reuses an existing ATS report when one exists, else runs a fresh one', async () => {
      atsReportRepository.findLatestByVariantId.mockResolvedValue(atsReport as never);
      await service.generateQuestions(owner, 'user-1', 'session-1', {});
      expect(atsAnalysisService.run).not.toHaveBeenCalled();

      atsReportRepository.findLatestByVariantId.mockResolvedValue(null);
      await service.generateQuestions(owner, 'user-1', 'session-1', {});
      expect(atsAnalysisService.run).toHaveBeenCalledWith(owner, 'user-1', {
        resumeVariantId: 'rv-1',
      });
    });

    it('resolves optimization summary and cover letter content only when the session has those ids', async () => {
      repository.findById.mockResolvedValue({
        ...pendingSession,
        optimizationId: 'opt-1',
        coverLetterId: 'cl-1',
      } as never);
      resumeOptimizationService.getOne.mockResolvedValue({
        summary: 'Emphasize leadership.',
      } as never);
      coverLetterService.getOne.mockResolvedValue({ content: 'Dear Hiring Manager...' } as never);

      await service.generateQuestions(owner, 'user-1', 'session-1', {});

      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(executeArgs.input).toMatchObject({
        optimizationSummary: 'Emphasize leadership.',
        coverLetterContent: 'Dear Hiring Manager...',
      });
    });

    it('passes null for optimization/cover-letter context when the session has neither id', async () => {
      await service.generateQuestions(owner, 'user-1', 'session-1', {});
      expect(resumeOptimizationService.getOne).not.toHaveBeenCalled();
      expect(coverLetterService.getOne).not.toHaveBeenCalled();
      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(executeArgs.input).toMatchObject({
        optimizationSummary: null,
        coverLetterContent: null,
      });
    });

    it('defaults questionCount to 6 and forwards a custom value when given', async () => {
      await service.generateQuestions(owner, 'user-1', 'session-1', {});
      let executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect((executeArgs.input as { questionCount: number }).questionCount).toBe(6);

      await service.generateQuestions(owner, 'user-1', 'session-1', { questionCount: 4 });
      executeArgs = aiOrchestrationService.execute.mock.calls[1]![0];
      expect((executeArgs.input as { questionCount: number }).questionCount).toBe(4);
    });

    it('executes via AiOrchestrationService with feature INTERVIEW_QUESTIONS, persists questions in order, and emits "generated"', async () => {
      await service.generateQuestions(owner, 'user-1', 'session-1', {});

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          feature: AIFeature.INTERVIEW_QUESTIONS,
          options: expect.objectContaining({ responseFormat: 'json' }),
        }),
      );
      expect(repository.createQuestions).toHaveBeenCalledWith('session-1', [
        expect.objectContaining({ order: 0, category: 'TECHNICAL', question: 'Q1' }),
        expect.objectContaining({ order: 1, category: 'BEHAVIORAL', question: 'Q2' }),
      ]);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'question',
          entityId: 'session-1',
          action: 'generated',
        }),
      );
    });

    it('auto-snapshots the resume state before generating questions (Phase 10.5 rule 8, "before Interview preparation")', async () => {
      await service.generateQuestions(owner, 'user-1', 'session-1', {});

      expect(resumeVariantService.snapshotBeforeAiAction).toHaveBeenCalledWith(
        owner,
        'user-1',
        'rv-1',
        expect.objectContaining({ jobTargetId: 'jt-1' }),
      );
    });

    it('creates no questions and propagates the error when AiOrchestrationService throws', async () => {
      const failure = new InvalidPromptError('AI response is not valid JSON.');
      aiOrchestrationService.execute.mockRejectedValue(failure);

      await expect(service.generateQuestions(owner, 'user-1', 'session-1', {})).rejects.toBe(
        failure,
      );
      expect(repository.createQuestions).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('the responseValidator passed to AiOrchestrationService throws InvalidPromptError on malformed AI text', async () => {
      await service.generateQuestions(owner, 'user-1', 'session-1', {});
      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(() => executeArgs.options!.responseValidator!({ text: 'not json' } as never)).toThrow(
        InvalidPromptError,
      );
    });

    it('charges AIFeature.INTERVIEW_QUESTIONS_JOB for a JOB-mode session, resolving only what the session actually has', async () => {
      repository.findById.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        questions: [],
        mode: 'JOB',
        resumeVariantId: null,
        jobTargetId: 'jt-1',
        jobDescription: 'Pasted vacancy text.',
      } as never);

      await service.generateQuestions(owner, 'user-1', 'session-1', {});

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({ feature: AIFeature.INTERVIEW_QUESTIONS_JOB }),
      );
      expect(resumeVariantService.getOne).not.toHaveBeenCalled();
      expect(atsAnalysisService.run).not.toHaveBeenCalled();
      expect(atsReportRepository.findLatestByVariantId).not.toHaveBeenCalled();
      expect(resumeVariantService.snapshotBeforeAiAction).not.toHaveBeenCalled();
      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(executeArgs.input).toMatchObject({
        mode: 'JOB',
        jobDescription: 'Pasted vacancy text.',
        resumeContent: null,
        atsReport: null,
      });
    });

    it('resolves ATS and snapshots the resume for a JOB-mode session that also has a resumeVariantId', async () => {
      repository.findById.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        questions: [],
        mode: 'JOB',
        resumeVariantId: 'rv-1',
        jobTargetId: 'jt-1',
        jobDescription: null,
      } as never);

      await service.generateQuestions(owner, 'user-1', 'session-1', {});

      expect(resumeVariantService.getOne).toHaveBeenCalledWith(owner, 'user-1', 'rv-1');
      expect(resumeVariantService.snapshotBeforeAiAction).toHaveBeenCalled();
      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(executeArgs.input).toMatchObject({ mode: 'JOB', resumeContent: { summary: 'x' } });
    });

    it('charges AIFeature.INTERVIEW_QUESTIONS_ROLE for a ROLE-mode session, never touching CV/Job Target/ATS', async () => {
      repository.findById.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        questions: [],
        mode: 'ROLE',
        role: 'Backend Developer',
        industry: 'Fintech',
        yearsExperience: 5,
        companyName: null,
      } as never);

      await service.generateQuestions(owner, 'user-1', 'session-1', {});

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({ feature: AIFeature.INTERVIEW_QUESTIONS_ROLE }),
      );
      expect(resumeVariantService.getOne).not.toHaveBeenCalled();
      expect(jobTargetService.getOne).not.toHaveBeenCalled();
      expect(atsAnalysisService.run).not.toHaveBeenCalled();
      expect(resumeVariantService.snapshotBeforeAiAction).not.toHaveBeenCalled();
      const executeArgs = aiOrchestrationService.execute.mock.calls[0]![0];
      expect(executeArgs.input).toMatchObject({
        mode: 'ROLE',
        role: 'Backend Developer',
        industry: 'Fintech',
        yearsExperience: 5,
        companyName: null,
      });
    });
  });

  describe('submitAnswer', () => {
    const sessionWithQuestions = {
      id: 'session-1',
      userId: 'user-1',
      status: 'IN_PROGRESS',
      questions: [{ id: 'q-1' }, { id: 'q-2' }],
    };

    it('denies a non-owner, non-admin user', async () => {
      await expect(
        service.submitAnswer(stranger, 'user-1', 'session-1', { questionId: 'q-1', answer: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequest when the session has already been evaluated', async () => {
      repository.findById.mockResolvedValue({
        ...sessionWithQuestions,
        status: 'COMPLETED',
      } as never);
      await expect(
        service.submitAnswer(owner, 'user-1', 'session-1', { questionId: 'q-1', answer: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound when the question does not belong to this session', async () => {
      repository.findById.mockResolvedValue(sessionWithQuestions as never);
      await expect(
        service.submitAnswer(owner, 'user-1', 'session-1', {
          questionId: 'not-in-session',
          answer: 'x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('upserts the answer (editable until evaluation) and emits "submitted"', async () => {
      repository.findById.mockResolvedValue(sessionWithQuestions as never);
      repository.upsertAnswer.mockResolvedValue({
        id: 'answer-1',
        questionId: 'q-1',
        answer: 'My answer',
      } as never);

      const result = await service.submitAnswer(owner, 'user-1', 'session-1', {
        questionId: 'q-1',
        answer: 'My answer',
      });

      expect(repository.upsertAnswer).toHaveBeenCalledWith('q-1', 'My answer');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'answer', entityId: 'q-1', action: 'submitted' }),
      );
      expect(result).toEqual({ id: 'answer-1', questionId: 'q-1', answer: 'My answer' });
    });
  });

  describe('evaluate', () => {
    const answeredSession = {
      id: 'session-1',
      userId: 'user-1',
      status: 'IN_PROGRESS',
      mode: 'RESUME',
      language: 'en',
      questions: [
        {
          id: 'q-1',
          order: 0,
          category: 'TECHNICAL',
          question: 'Q1',
          idealAnswer: 'A1',
          answer: { answer: 'My A1' },
        },
        {
          id: 'q-2',
          order: 1,
          category: 'BEHAVIORAL',
          question: 'Q2',
          idealAnswer: 'A2',
          answer: { answer: 'My A2' },
        },
      ],
    };

    beforeEach(() => {
      aiOrchestrationService.execute.mockResolvedValue({
        text: validEvaluationResponse,
        creditsCharged: 30,
      } as never);
    });

    it('denies a non-owner, non-admin user', async () => {
      await expect(service.evaluate(stranger, 'user-1', 'session-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws BadRequest when already evaluated', async () => {
      repository.findById.mockResolvedValue({ ...answeredSession, status: 'COMPLETED' } as never);
      await expect(service.evaluate(owner, 'user-1', 'session-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequest when no questions have been generated', async () => {
      repository.findById.mockResolvedValue({ ...answeredSession, questions: [] } as never);
      await expect(service.evaluate(owner, 'user-1', 'session-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequest when any question is unanswered', async () => {
      repository.findById.mockResolvedValue({
        ...answeredSession,
        questions: [
          answeredSession.questions[0],
          { ...answeredSession.questions[1], answer: null },
        ],
      } as never);
      await expect(service.evaluate(owner, 'user-1', 'session-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    });

    it('executes via AiOrchestrationService with feature INTERVIEW_EVALUATION, applies per-answer evaluations, computes session scores, and completes the session', async () => {
      repository.findById.mockResolvedValue(answeredSession as never);

      await service.evaluate(owner, 'user-1', 'session-1');

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', feature: AIFeature.INTERVIEW_EVALUATION }),
      );
      expect(repository.applyEvaluation).toHaveBeenCalledWith('q-1', {
        score: 80,
        feedback: 'Good',
        strengths: ['s1'],
        improvements: ['i1'],
      });
      expect(repository.applyEvaluation).toHaveBeenCalledWith('q-2', {
        score: 60,
        feedback: 'OK',
        strengths: ['s2'],
        improvements: ['i2'],
      });
      // overall = (80+60)/2 = 70; technical = 80 (only TECHNICAL answer); no COMMUNICATION -> falls back to 70;
      // confidence includes BEHAVIORAL (60) only among the 4 confidence categories -> 60
      expect(repository.completeSession).toHaveBeenCalledWith('session-1', {
        overallScore: 70,
        technicalScore: 80,
        communicationScore: 70,
        confidenceScore: 60,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'evaluation',
          entityId: 'session-1',
          action: 'completed',
        }),
      );
    });

    it('propagates the error and applies/completes nothing when AiOrchestrationService throws', async () => {
      repository.findById.mockResolvedValue(answeredSession as never);
      const failure = new InvalidPromptError('AI response is not valid JSON.');
      aiOrchestrationService.execute.mockRejectedValue(failure);

      await expect(service.evaluate(owner, 'user-1', 'session-1')).rejects.toBe(failure);
      expect(repository.applyEvaluation).not.toHaveBeenCalled();
      expect(repository.completeSession).not.toHaveBeenCalled();
    });

    it('charges AIFeature.INTERVIEW_EVALUATION_JOB for a JOB-mode session', async () => {
      repository.findById.mockResolvedValue({ ...answeredSession, mode: 'JOB' } as never);
      await service.evaluate(owner, 'user-1', 'session-1');
      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({ feature: AIFeature.INTERVIEW_EVALUATION_JOB }),
      );
    });

    it('charges AIFeature.INTERVIEW_EVALUATION_ROLE for a ROLE-mode session', async () => {
      repository.findById.mockResolvedValue({ ...answeredSession, mode: 'ROLE' } as never);
      await service.evaluate(owner, 'user-1', 'session-1');
      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({ feature: AIFeature.INTERVIEW_EVALUATION_ROLE }),
      );
    });
  });

  describe('list / getOne', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound for a session belonging to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'session-1', userId: 'someone-else' } as never);
      await expect(service.getOne(owner, 'user-1', 'session-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes and emits "deleted"', async () => {
      repository.findById.mockResolvedValue({ id: 'session-1', userId: 'user-1' } as never);

      await service.remove(owner, 'user-1', 'session-1');

      expect(repository.softDeleteSession).toHaveBeenCalledWith('session-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'interview',
          entityId: 'session-1',
          action: 'deleted',
        }),
      );
    });

    it('throws NotFound instead of deleting when the session belongs to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'session-1', userId: 'someone-else' } as never);
      await expect(service.remove(owner, 'user-1', 'session-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.softDeleteSession).not.toHaveBeenCalled();
    });
  });
});
