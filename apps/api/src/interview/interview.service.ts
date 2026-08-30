import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AtsReport, InterviewAnswer, InterviewMode, InterviewSession } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeVariantService } from '../resume-variant/resume-variant.service';
import { JobTargetService } from '../job-target/job-target.service';
import { AtsAnalysisService } from '../ats/ats-analysis.service';
import { AtsReportRepository } from '../ats/ats-report.repository';
import { ResumeOptimizationService } from '../resume-optimization/resume-optimization.service';
import { CoverLetterService } from '../cover-letter/cover-letter.service';
import { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import type { InterviewQuestionPromptInput } from './interview-question-prompt-builder';
import type { InterviewEvaluationPromptInput } from './interview-evaluation-prompt-builder';
import { QuestionResponseParser } from './question-response.parser';
import { EvaluationResponseParser } from './evaluation-response.parser';
import { computeSessionScores } from './interview-scoring.util';
import {
  InterviewRepository,
  type CreateSessionData,
  type SessionWithQuestions,
} from './interview.repository';
import type { StartInterviewDto } from './dto/start-interview.dto';
import type { GenerateQuestionsDto } from './dto/generate-questions.dto';
import type { SubmitAnswerDto } from './dto/submit-answer.dto';

type InterviewEntityType = 'interview' | 'question' | 'answer' | 'evaluation';
type InterviewAction = 'started' | 'generated' | 'submitted' | 'completed' | 'deleted';

/** One question per QuestionCategory value when the caller doesn't specify a count. */
const DEFAULT_QUESTION_COUNT = 6;

/** FASE 11 — each mode is genuinely a different price point (see ai-feature.enum.ts), so AI Orchestration must be told a different AIFeature per mode; both maps are the single source of truth for that mapping. */
const QUESTIONS_FEATURE_BY_MODE: Record<InterviewMode, AIFeature> = {
  RESUME: AIFeature.INTERVIEW_QUESTIONS,
  JOB: AIFeature.INTERVIEW_QUESTIONS_JOB,
  ROLE: AIFeature.INTERVIEW_QUESTIONS_ROLE,
};
const EVALUATION_FEATURE_BY_MODE: Record<InterviewMode, AIFeature> = {
  RESUME: AIFeature.INTERVIEW_EVALUATION,
  JOB: AIFeature.INTERVIEW_EVALUATION_JOB,
  ROLE: AIFeature.INTERVIEW_EVALUATION_ROLE,
};

/**
 * Orchestrates the Interview Preparation flow per
 * docs/architecture/interview-engine.md, across the 3 modes FASE 11 adds
 * (RESUME/JOB/ROLE — see §"Three Modes"): Resume Variant → Job Target → ATS
 * Report → optional Resume Optimization summary → optional Cover Letter
 * content → AI Orchestration → Prompt Builder → AI Provider → persisted
 * questions (Step 1); user-submitted answers (Step 2, editable until
 * evaluation); AI Orchestration again → per-answer scores → computed
 * session scores (Step 3). Never calls a provider or the credit ledger
 * directly — every AI call goes through AiOrchestrationService.execute(),
 * following the exact template Resume Optimization (Phase 7) and Cover
 * Letter (Phase 8) established.
 */
@Injectable()
export class InterviewService {
  constructor(
    private readonly repository: InterviewRepository,
    private readonly resumeVariantService: ResumeVariantService,
    private readonly jobTargetService: JobTargetService,
    private readonly atsAnalysisService: AtsAnalysisService,
    private readonly atsReportRepository: AtsReportRepository,
    private readonly resumeOptimizationService: ResumeOptimizationService,
    private readonly coverLetterService: CoverLetterService,
    private readonly aiOrchestrationService: AiOrchestrationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async start(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: StartInterviewDto,
  ): Promise<InterviewSession> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    switch (dto.mode) {
      case 'RESUME':
        return this.startResumeMode(requestingUser, targetUserId, dto);
      case 'JOB':
        return this.startJobMode(requestingUser, targetUserId, dto);
      case 'ROLE':
        return this.startRoleMode(requestingUser, targetUserId, dto);
    }
  }

  /** Mode RESUME — CV + Job Target, both required. Behavior unchanged from pre-FASE-11: the Job Target is always derived from the Resume Variant's own jobTargetId, never read from the request. */
  private async startResumeMode(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: StartInterviewDto,
  ): Promise<InterviewSession> {
    this.assertFieldsAbsent(
      dto,
      ['jobDescription', 'role', 'industry', 'yearsExperience', 'companyName'],
      'RESUME',
    );

    if (!dto.resumeVariantId) {
      throw new BadRequestException(
        'Para entrevistas baseadas no seu CV, é necessário selecionar uma versão de currículo.',
      );
    }
    const variant = await this.resumeVariantService.getOne(
      requestingUser,
      targetUserId,
      dto.resumeVariantId,
    );
    if (!variant.jobTargetId) {
      throw new BadRequestException(
        'Para entrevistas baseadas no seu CV, selecione uma vaga associada.',
      );
    }
    const jobTarget = await this.jobTargetService.getOne(
      requestingUser,
      targetUserId,
      variant.jobTargetId,
    );

    // Ownership-checked only, per Cover Letter's identical optimizationId
    // precedent (Phase 8) — not cross-validated against resumeVariantId.
    if (dto.optimizationId) {
      await this.resumeOptimizationService.getOne(requestingUser, targetUserId, dto.optimizationId);
    }
    if (dto.coverLetterId) {
      await this.coverLetterService.getOne(requestingUser, targetUserId, dto.coverLetterId);
    }

    const session = await this.createSession(targetUserId, dto, {
      mode: 'RESUME',
      resumeVariantId: variant.id,
      jobTargetId: jobTarget.id,
      optimizationId: dto.optimizationId,
      coverLetterId: dto.coverLetterId,
    });
    return session;
  }

  /**
   * Mode JOB — CV is never required. Accepts jobTargetId and/or
   * jobDescription (at least one), plus an optional resumeVariantId as
   * additional context. ATS is only ever attempted when a Resume Variant is
   * actually attached — "never fail just because there is no CV".
   */
  private async startJobMode(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: StartInterviewDto,
  ): Promise<InterviewSession> {
    this.assertFieldsAbsent(dto, ['role', 'industry', 'yearsExperience', 'companyName'], 'JOB');

    let jobTargetId: string | undefined;
    if (dto.jobTargetId) {
      const jobTarget = await this.jobTargetService.getOne(
        requestingUser,
        targetUserId,
        dto.jobTargetId,
      );
      jobTargetId = jobTarget.id;
    }

    let resumeVariantId: string | undefined;
    if (dto.resumeVariantId) {
      const variant = await this.resumeVariantService.getOne(
        requestingUser,
        targetUserId,
        dto.resumeVariantId,
      );
      resumeVariantId = variant.id;
    }

    const jobDescription = this.normalizeOptionalText(dto.jobDescription);
    if (!jobTargetId && !jobDescription) {
      throw new BadRequestException(
        'Para este modo, indique uma vaga existente ou cole a descrição da vaga.',
      );
    }

    if ((dto.optimizationId || dto.coverLetterId) && !resumeVariantId) {
      throw new BadRequestException(
        'optimizationId/coverLetterId só podem ser usados quando é fornecida uma versão de currículo.',
      );
    }
    if (dto.optimizationId) {
      await this.resumeOptimizationService.getOne(requestingUser, targetUserId, dto.optimizationId);
    }
    if (dto.coverLetterId) {
      await this.coverLetterService.getOne(requestingUser, targetUserId, dto.coverLetterId);
    }

    return this.createSession(targetUserId, dto, {
      mode: 'JOB',
      resumeVariantId,
      jobTargetId,
      jobDescription,
      optimizationId: dto.optimizationId,
      coverLetterId: dto.coverLetterId,
    });
  }

  /** Mode ROLE — no CV, no Job Target. Only what the user explicitly typed becomes candidate context. */
  private async startRoleMode(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: StartInterviewDto,
  ): Promise<InterviewSession> {
    this.assertFieldsAbsent(
      dto,
      ['resumeVariantId', 'jobTargetId', 'jobDescription', 'optimizationId', 'coverLetterId'],
      'ROLE',
    );

    const role = this.normalizeOptionalText(dto.role);
    if (!role) {
      throw new BadRequestException('Indique o cargo que pretende praticar.');
    }

    return this.createSession(targetUserId, dto, {
      mode: 'ROLE',
      role,
      industry: this.normalizeOptionalText(dto.industry),
      yearsExperience: dto.yearsExperience,
      companyName: this.normalizeOptionalText(dto.companyName),
    });
  }

  private async createSession(
    targetUserId: string,
    dto: StartInterviewDto,
    modeFields: Partial<CreateSessionData> & Pick<CreateSessionData, 'mode'>,
  ): Promise<InterviewSession> {
    const session = await this.repository.createSession(targetUserId, {
      type: dto.type,
      difficulty: dto.difficulty,
      language: dto.language,
      ...modeFields,
    });
    this.emit(targetUserId, session.id, 'started', 'interview');
    return session;
  }

  /** Throws when any of `fields` was supplied for a mode that doesn't use it — "não permitir combinações semanticamente inválidas silenciosamente". */
  private assertFieldsAbsent(
    dto: StartInterviewDto,
    fields: Array<keyof StartInterviewDto>,
    mode: string,
  ): void {
    const present = fields.filter((field) => dto[field] !== undefined);
    if (present.length > 0) {
      throw new BadRequestException(
        `Os campos ${present.join(', ')} não são aplicáveis ao modo ${mode}.`,
      );
    }
  }

  private normalizeOptionalText(value: string | undefined): string | undefined {
    if (value == null) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /** Step 1. Charges credits via AiOrchestrationService.execute(); creates no row of its own on failure — "Questions immutable" means this can only ever run once per session. */
  async generateQuestions(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: GenerateQuestionsDto,
  ): Promise<SessionWithQuestions> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, id);
    if (session.questions.length > 0) {
      throw new BadRequestException('Questions have already been generated for this session.');
    }

    const questionCount = dto.questionCount ?? DEFAULT_QUESTION_COUNT;
    const promptInput = await this.buildQuestionPromptInput(
      requestingUser,
      targetUserId,
      session,
      questionCount,
    );

    const result = await this.aiOrchestrationService.execute({
      userId: targetUserId,
      feature: QUESTIONS_FEATURE_BY_MODE[session.mode],
      input: promptInput,
      idempotencyKey: `interview-questions:${targetUserId}:${randomUUID()}`,
      options: {
        responseFormat: 'json',
        responseValidator: (generateResult) => {
          QuestionResponseParser.parse(generateResult.text);
        },
      },
    });

    const parsed = QuestionResponseParser.parse(result.text);
    await this.repository.createQuestions(
      id,
      parsed.map((q, index) => ({
        order: index,
        category: q.category,
        question: q.question,
        idealAnswer: q.idealAnswer,
        tips: q.tips,
      })),
    );

    this.emit(targetUserId, id, 'generated', 'question', { questionCount: parsed.length });
    return this.findOwnedOrThrow(targetUserId, id);
  }

  /**
   * Resolves the mode-specific prompt input for Step 1. RESUME keeps its
   * exact pre-FASE-11 behavior (CV + Job Target both required — the guard
   * below is a defensive safety net; startResumeMode() already guarantees
   * both are set). JOB resolves whichever of resumeVariantId/jobTargetId/
   * jobDescription the session actually has, and only ever attempts ATS or
   * the Resume Version History snapshot when a Resume Variant is attached.
   * ROLE needs none of that — no CV, no Job Target, no ATS, no snapshot.
   */
  private async buildQuestionPromptInput(
    requestingUser: RequestUser,
    targetUserId: string,
    session: SessionWithQuestions,
    questionCount: number,
  ): Promise<InterviewQuestionPromptInput> {
    const common = {
      type: session.type,
      difficulty: session.difficulty,
      language: session.language,
      questionCount,
    };

    if (session.mode === 'ROLE') {
      if (!session.role) {
        throw new BadRequestException('Esta sessão de entrevista não tem um cargo associado.');
      }
      return {
        mode: 'ROLE',
        role: session.role,
        industry: session.industry,
        yearsExperience: session.yearsExperience,
        companyName: session.companyName,
        ...common,
      };
    }

    if (session.mode === 'JOB') {
      const variant = session.resumeVariantId
        ? await this.resumeVariantService.getOne(
            requestingUser,
            targetUserId,
            session.resumeVariantId,
          )
        : null;
      const jobTarget = session.jobTargetId
        ? await this.jobTargetService.getOne(requestingUser, targetUserId, session.jobTargetId)
        : null;
      const atsReport = variant
        ? await this.resolveAtsReport(requestingUser, targetUserId, variant.id)
        : null;
      const optimizationSummary = await this.resolveOptimizationSummary(
        requestingUser,
        targetUserId,
        session.optimizationId ?? undefined,
      );
      const coverLetterContent = await this.resolveCoverLetterContent(
        requestingUser,
        targetUserId,
        session.coverLetterId ?? undefined,
      );

      if (variant) {
        await this.snapshotBeforeQuestions(requestingUser, targetUserId, variant.id, jobTarget?.id);
      }

      return {
        mode: 'JOB',
        jobTarget,
        jobDescription: session.jobDescription,
        resumeContent: variant ? ((variant.content ?? {}) as Record<string, unknown>) : null,
        atsReport,
        optimizationSummary,
        coverLetterContent,
        ...common,
      };
    }

    // Mode RESUME — defensive safety net; startResumeMode() guarantees both
    // are always set for this mode, so this branch should be unreachable.
    if (!session.resumeVariantId || !session.jobTargetId) {
      throw new BadRequestException(
        'Esta sessão de entrevista não tem uma versão de currículo/vaga associada.',
      );
    }
    const variant = await this.resumeVariantService.getOne(
      requestingUser,
      targetUserId,
      session.resumeVariantId,
    );
    const jobTarget = await this.jobTargetService.getOne(
      requestingUser,
      targetUserId,
      session.jobTargetId,
    );
    const atsReport = await this.resolveAtsReport(requestingUser, targetUserId, variant.id);
    const optimizationSummary = await this.resolveOptimizationSummary(
      requestingUser,
      targetUserId,
      session.optimizationId ?? undefined,
    );
    const coverLetterContent = await this.resolveCoverLetterContent(
      requestingUser,
      targetUserId,
      session.coverLetterId ?? undefined,
    );
    await this.snapshotBeforeQuestions(requestingUser, targetUserId, variant.id, jobTarget.id);

    return {
      mode: 'RESUME',
      resumeContent: (variant.content ?? {}) as Record<string, unknown>,
      jobTarget,
      atsReport,
      optimizationSummary,
      coverLetterContent,
      ...common,
    };
  }

  /** Auto-snapshot hook (Phase 10.5 Resume Version History, rule 8) — "before Interview preparation". Failures are swallowed inside snapshotBeforeAiAction() itself — a missed audit snapshot must never block question generation. Only called when a Resume Variant is actually attached to the session (modes RESUME, and JOB when one was supplied). */
  private async snapshotBeforeQuestions(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
    jobTargetId: string | undefined,
  ): Promise<void> {
    await this.resumeVariantService.snapshotBeforeAiAction(
      requestingUser,
      targetUserId,
      variantId,
      {
        label: 'CUSTOM',
        changeSummary: 'Snapshot before generating interview questions',
        jobTargetId,
      },
    );
  }

  /** Step 2. "Answers editable until evaluation" — resubmitting the same questionId before evaluate() overwrites the previous answer. Never touches credits or AI. */
  async submitAnswer(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: SubmitAnswerDto,
  ): Promise<InterviewAnswer> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, id);
    if (session.status === 'COMPLETED') {
      throw new BadRequestException(
        'Cannot submit answers after this interview session has been evaluated.',
      );
    }
    const question = session.questions.find((q) => q.id === dto.questionId);
    if (!question) {
      throw new NotFoundException('Question not found in this interview session.');
    }

    const answer = await this.repository.upsertAnswer(dto.questionId, dto.answer);
    this.emit(targetUserId, dto.questionId, 'submitted', 'answer', { sessionId: id });
    return answer;
  }

  /** Step 3. Charges credits via AiOrchestrationService.execute(); computes and persists the four session-level scores; sets status COMPLETED. Evaluation is mode-agnostic (see InterviewEvaluationPromptInput) — only the charged AIFeature differs by session.mode. */
  async evaluate(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<SessionWithQuestions> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, id);
    if (session.status === 'COMPLETED') {
      throw new BadRequestException('This interview session has already been evaluated.');
    }
    if (session.questions.length === 0) {
      throw new BadRequestException('No questions have been generated for this session yet.');
    }
    const unanswered = session.questions.filter((q) => !q.answer);
    if (unanswered.length > 0) {
      throw new BadRequestException('All questions must be answered before evaluation.');
    }

    const items = session.questions.map((q, index) => ({
      order: index + 1,
      category: q.category,
      question: q.question,
      idealAnswer: q.idealAnswer,
      answer: q.answer!.answer,
    }));
    const promptInput: InterviewEvaluationPromptInput = { language: session.language, items };

    const result = await this.aiOrchestrationService.execute({
      userId: targetUserId,
      feature: EVALUATION_FEATURE_BY_MODE[session.mode],
      input: promptInput,
      idempotencyKey: `interview-evaluation:${targetUserId}:${randomUUID()}`,
      options: {
        responseFormat: 'json',
        responseValidator: (generateResult) => {
          EvaluationResponseParser.parse(generateResult.text, items.length);
        },
      },
    });

    const parsed = EvaluationResponseParser.parse(result.text, items.length);
    for (let i = 0; i < session.questions.length; i++) {
      const question = session.questions[i]!;
      const evaluation = parsed[i]!;
      await this.repository.applyEvaluation(question.id, {
        score: evaluation.score,
        feedback: evaluation.feedback,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
      });
    }

    const scores = computeSessionScores(
      session.questions.map((q, i) => ({ category: q.category, score: parsed[i]!.score })),
    );
    await this.repository.completeSession(id, scores);

    this.emit(
      targetUserId,
      id,
      'completed',
      'evaluation',
      scores as unknown as Record<string, unknown>,
    );
    return this.findOwnedOrThrow(targetUserId, id);
  }

  async list(requestingUser: RequestUser, targetUserId: string): Promise<SessionWithQuestions[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.repository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<SessionWithQuestions> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, id);
  }

  async remove(requestingUser: RequestUser, targetUserId: string, id: string): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    await this.repository.softDeleteSession(id);
    this.emit(targetUserId, id, 'deleted', 'interview');
  }

  /** Reuses the most recent existing ATS report for this variant, or runs a fresh one if none exists — same pattern as ResumeOptimizationService/CoverLetterService (Phase 7/8). Only ever called when a Resume Variant is attached. */
  private async resolveAtsReport(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
  ): Promise<AtsReport> {
    const existing = await this.atsReportRepository.findLatestByVariantId(variantId);
    if (existing) {
      return existing;
    }
    return this.atsAnalysisService.run(requestingUser, targetUserId, {
      resumeVariantId: variantId,
    });
  }

  private async resolveOptimizationSummary(
    requestingUser: RequestUser,
    targetUserId: string,
    optimizationId: string | undefined,
  ): Promise<string | null> {
    if (!optimizationId) {
      return null;
    }
    const optimization = await this.resumeOptimizationService.getOne(
      requestingUser,
      targetUserId,
      optimizationId,
    );
    return optimization.summary;
  }

  private async resolveCoverLetterContent(
    requestingUser: RequestUser,
    targetUserId: string,
    coverLetterId: string | undefined,
  ): Promise<string | null> {
    if (!coverLetterId) {
      return null;
    }
    const coverLetter = await this.coverLetterService.getOne(
      requestingUser,
      targetUserId,
      coverLetterId,
    );
    return coverLetter.content;
  }

  private async findOwnedOrThrow(targetUserId: string, id: string): Promise<SessionWithQuestions> {
    const session = await this.repository.findById(id);
    if (!session || session.userId !== targetUserId) {
      throw new NotFoundException('Interview session not found.');
    }
    return session;
  }

  private emit(
    userId: string,
    entityId: string,
    action: InterviewAction,
    entityType: InterviewEntityType,
    metadata?: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, entityType, entityId, action, metadata),
    );
  }
}
