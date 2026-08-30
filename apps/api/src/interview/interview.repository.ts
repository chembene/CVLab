import { Injectable } from '@nestjs/common';
import type {
  InterviewAnswer,
  InterviewDifficulty,
  InterviewMode,
  InterviewQuestion,
  InterviewSession,
  InterviewType,
  Prisma,
  QuestionCategory,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * FASE 11 — one shape for all 3 modes. `resumeVariantId`/`jobTargetId` were
 * required in every session before FASE 11 (mode RESUME was the only mode);
 * they're optional now that modes JOB/ROLE may create a session without
 * either. `createSession()` itself needed no change — it already forwards
 * this object verbatim into `interviewSession.create()`, so a wider shape
 * here is the only edit required.
 */
export interface CreateSessionData {
  mode: InterviewMode;
  resumeVariantId?: string;
  jobTargetId?: string;
  jobDescription?: string;
  role?: string;
  industry?: string;
  yearsExperience?: number;
  companyName?: string;
  optimizationId?: string;
  coverLetterId?: string;
  type: InterviewType;
  difficulty: InterviewDifficulty;
  language: string;
}

export interface CreateQuestionData {
  order: number;
  category: QuestionCategory;
  question: string;
  idealAnswer: string;
  tips: string;
}

export interface CompleteSessionData {
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  confidenceScore: number;
}

export interface ApplyEvaluationData {
  score: number;
  feedback: string;
  strengths: Prisma.InputJsonValue;
  improvements: Prisma.InputJsonValue;
}

export type QuestionWithAnswer = InterviewQuestion & { answer: InterviewAnswer | null };
export type SessionWithQuestions = InterviewSession & { questions: QuestionWithAnswer[] };

const QUESTIONS_INCLUDE = {
  questions: { orderBy: { order: 'asc' as const }, include: { answer: true } },
} satisfies Prisma.InterviewSessionInclude;

/** Only Prisma access for `interview_sessions`, `interview_questions`, and `interview_answers` lives here. */
@Injectable()
export class InterviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  createSession(userId: string, data: CreateSessionData): Promise<InterviewSession> {
    return this.prisma.interviewSession.create({ data: { userId, ...data } });
  }

  findAllByUserId(userId: string): Promise<SessionWithQuestions[]> {
    return this.prisma.interviewSession.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: QUESTIONS_INCLUDE,
    });
  }

  findById(id: string): Promise<SessionWithQuestions | null> {
    return this.prisma.interviewSession.findFirst({
      where: { id, deletedAt: null },
      include: QUESTIONS_INCLUDE,
    });
  }

  /** "Questions immutable" — created once, in one transaction so `order` is preserved atomically; no update method exists for this table anywhere in the module. */
  createQuestions(
    sessionId: string,
    questions: CreateQuestionData[],
  ): Promise<InterviewQuestion[]> {
    return this.prisma.$transaction(
      questions.map((data) =>
        this.prisma.interviewQuestion.create({ data: { sessionId, ...data } }),
      ),
    );
  }

  findQuestionById(id: string): Promise<InterviewQuestion | null> {
    return this.prisma.interviewQuestion.findUnique({ where: { id } });
  }

  /** "Answers editable until evaluation" — resubmitting the same questionId overwrites this one row, never creates a second one (questionId is @unique on interview_answers). */
  upsertAnswer(questionId: string, answer: string): Promise<InterviewAnswer> {
    return this.prisma.interviewAnswer.upsert({
      where: { questionId },
      create: { questionId, answer, strengths: [], improvements: [] },
      update: { answer },
    });
  }

  applyEvaluation(questionId: string, data: ApplyEvaluationData): Promise<InterviewAnswer> {
    return this.prisma.interviewAnswer.update({ where: { questionId }, data });
  }

  completeSession(id: string, scores: CompleteSessionData): Promise<InterviewSession> {
    return this.prisma.interviewSession.update({
      where: { id },
      data: { ...scores, status: 'COMPLETED', completedAt: new Date() },
    });
  }

  softDeleteSession(id: string): Promise<InterviewSession> {
    return this.prisma.interviewSession.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
