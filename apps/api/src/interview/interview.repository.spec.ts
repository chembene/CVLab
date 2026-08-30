import { InterviewRepository } from './interview.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('InterviewRepository', () => {
  function buildPrismaMock() {
    const interviewSession = {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    };
    const interviewQuestion = { create: jest.fn(), findUnique: jest.fn() };
    const interviewAnswer = { upsert: jest.fn(), update: jest.fn() };
    const prisma = {
      interviewSession,
      interviewQuestion,
      interviewAnswer,
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    } as unknown as jest.Mocked<PrismaService>;
    return { prisma, interviewSession, interviewQuestion, interviewAnswer };
  }

  const QUESTIONS_INCLUDE = { questions: { orderBy: { order: 'asc' }, include: { answer: true } } };

  it('createSession() writes every provided field', async () => {
    const { prisma, interviewSession } = buildPrismaMock();
    const repository = new InterviewRepository(prisma);
    const data = {
      mode: 'RESUME' as const,
      resumeVariantId: 'rv-1',
      jobTargetId: 'jt-1',
      type: 'MIXED' as const,
      difficulty: 'SENIOR' as const,
      language: 'en',
    };

    await repository.createSession('user-1', data);

    expect(interviewSession.create).toHaveBeenCalledWith({ data: { userId: 'user-1', ...data } });
  });

  it('findAllByUserId() excludes soft-deleted rows, orders most-recent-first, and includes ordered questions+answers', async () => {
    const { prisma, interviewSession } = buildPrismaMock();
    const repository = new InterviewRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(interviewSession.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: QUESTIONS_INCLUDE,
    });
  });

  it('findById() excludes soft-deleted rows and includes ordered questions+answers', async () => {
    const { prisma, interviewSession } = buildPrismaMock();
    const repository = new InterviewRepository(prisma);

    await repository.findById('session-1');

    expect(interviewSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'session-1', deletedAt: null },
      include: QUESTIONS_INCLUDE,
    });
  });

  it('createQuestions() creates every question inside one transaction, preserving order', async () => {
    const { prisma, interviewQuestion } = buildPrismaMock();
    const repository = new InterviewRepository(prisma);
    const questions = [
      { order: 0, category: 'TECHNICAL' as const, question: 'Q1', idealAnswer: 'A1', tips: 'T1' },
      { order: 1, category: 'BEHAVIORAL' as const, question: 'Q2', idealAnswer: 'A2', tips: 'T2' },
    ];

    await repository.createQuestions('session-1', questions);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(interviewQuestion.create).toHaveBeenCalledWith({
      data: { sessionId: 'session-1', ...questions[0] },
    });
    expect(interviewQuestion.create).toHaveBeenCalledWith({
      data: { sessionId: 'session-1', ...questions[1] },
    });
  });

  it('findQuestionById() delegates to findUnique', async () => {
    const { prisma, interviewQuestion } = buildPrismaMock();
    const repository = new InterviewRepository(prisma);

    await repository.findQuestionById('question-1');

    expect(interviewQuestion.findUnique).toHaveBeenCalledWith({ where: { id: 'question-1' } });
  });

  it('upsertAnswer() creates with empty strengths/improvements or updates just the answer text', async () => {
    const { prisma, interviewAnswer } = buildPrismaMock();
    const repository = new InterviewRepository(prisma);

    await repository.upsertAnswer('question-1', 'My answer');

    expect(interviewAnswer.upsert).toHaveBeenCalledWith({
      where: { questionId: 'question-1' },
      create: { questionId: 'question-1', answer: 'My answer', strengths: [], improvements: [] },
      update: { answer: 'My answer' },
    });
  });

  it('applyEvaluation() updates score/feedback/strengths/improvements', async () => {
    const { prisma, interviewAnswer } = buildPrismaMock();
    const repository = new InterviewRepository(prisma);
    const data = { score: 90, feedback: 'Great', strengths: ['a'], improvements: ['b'] };

    await repository.applyEvaluation('question-1', data);

    expect(interviewAnswer.update).toHaveBeenCalledWith({
      where: { questionId: 'question-1' },
      data,
    });
  });

  it('completeSession() sets the 4 scores, status COMPLETED, and completedAt', async () => {
    const { prisma, interviewSession } = buildPrismaMock();
    const repository = new InterviewRepository(prisma);
    const scores = {
      overallScore: 80,
      technicalScore: 85,
      communicationScore: 75,
      confidenceScore: 78,
    };

    await repository.completeSession('session-1', scores);

    expect(interviewSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { ...scores, status: 'COMPLETED', completedAt: expect.any(Date) },
    });
  });

  it('softDeleteSession() sets deletedAt', async () => {
    const { prisma, interviewSession } = buildPrismaMock();
    const repository = new InterviewRepository(prisma);

    await repository.softDeleteSession('session-1');

    expect(interviewSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
