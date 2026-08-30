import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreditService } from '../src/credits/credit.service';
import { AIFeature } from '../src/ai-orchestration/constants/ai-feature.enum';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';

/**
 * Covers the Smart Application Pipeline end-to-end against the real
 * Postgres/Redis/Chromium — no service mocks. Deliberately does NOT
 * re-verify the internals of ATS/Resume Optimization/Cover Letter/
 * Interview/Export/Application (each already has its own exhaustive e2e
 * suite); this file proves the *orchestration* — ownership across the
 * session, correct delegation, correct id recording, correct currentStep
 * advancement, and the full real happy path actually working end-to-end.
 */
describe('Smart Application Pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `app-pipeline-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';
  const PDF_KEY = 'export_resume_pdf';
  const DOCX_KEY = 'export_resume_docx';

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    creditService = moduleRef.get(CreditService);

    await prisma.featurePricing.createMany({
      data: [
        { featureKey: AIFeature.RESUME_OPTIMIZATION, cost: 80, active: true },
        { featureKey: AIFeature.COVER_LETTER, cost: 40, active: true },
        { featureKey: AIFeature.INTERVIEW_QUESTIONS_JOB, cost: 25, active: true },
        { featureKey: AIFeature.INTERVIEW_EVALUATION_JOB, cost: 25, active: true },
        { featureKey: PDF_KEY, cost: 10, active: true },
        { featureKey: DOCX_KEY, cost: 5, active: true },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `app-pipeline-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        const variants = await prisma.resumeVariant.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const variantIds = variants.map((v) => v.id);

        await prisma.applicationPipelineSession.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.exportedDocument.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.application.deleteMany({ where: { userId: { in: userIds } } });

        const interviewSessions = await prisma.interviewSession.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const interviewSessionIds = interviewSessions.map((s) => s.id);
        if (interviewSessionIds.length > 0) {
          const questions = await prisma.interviewQuestion.findMany({
            where: { sessionId: { in: interviewSessionIds } },
            select: { id: true },
          });
          const questionIds = questions.map((q) => q.id);
          if (questionIds.length > 0) {
            await prisma.interviewAnswer.deleteMany({ where: { questionId: { in: questionIds } } });
          }
          await prisma.interviewQuestion.deleteMany({
            where: { sessionId: { in: interviewSessionIds } },
          });
        }
        await prisma.interviewSession.deleteMany({ where: { userId: { in: userIds } } });

        await prisma.coverLetter.deleteMany({ where: { userId: { in: userIds } } });

        const optimizations = await prisma.resumeOptimization.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const optimizationIds = optimizations.map((o) => o.id);
        if (optimizationIds.length > 0) {
          await prisma.optimizationSuggestion.deleteMany({
            where: { optimizationId: { in: optimizationIds } },
          });
        }
        await prisma.resumeOptimization.deleteMany({ where: { userId: { in: userIds } } });

        if (variantIds.length > 0) {
          await prisma.resumeVariantVersion.deleteMany({
            where: { resumeVariantId: { in: variantIds } },
          });
        }
        await prisma.$transaction([
          prisma.atsReport.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.resumeVariant.deleteMany({ where: { userId: { in: userIds } } }),
        ]);

        const resumes = await prisma.masterResume.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const resumeIds = resumes.map((r) => r.id);
        if (resumeIds.length > 0) {
          await prisma.$transaction([
            prisma.workExperience.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.education.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.skill.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.language.deleteMany({ where: { resumeId: { in: resumeIds } } }),
          ]);
        }

        const jobTargets = await prisma.jobTarget.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const jobTargetIds = jobTargets.map((jt) => jt.id);
        if (jobTargetIds.length > 0) {
          await prisma.$transaction([
            prisma.jobTargetKeyword.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
            prisma.jobTargetSkill.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
            prisma.jobTargetLanguage.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
          ]);
        }

        await prisma.$transaction([
          prisma.jobTarget.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.masterResume.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.profile.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.aiRequest.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.creditWallet.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.historyEvent.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } }),
          prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.verificationToken.deleteMany({ where: { userId: { in: userIds } } }),
        ]);
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.featurePricing.deleteMany({
        where: {
          featureKey: {
            in: [
              AIFeature.RESUME_OPTIMIZATION,
              AIFeature.COVER_LETTER,
              AIFeature.INTERVIEW_QUESTIONS_JOB,
              AIFeature.INTERVIEW_EVALUATION_JOB,
              PDF_KEY,
              DOCX_KEY,
            ],
          },
        },
      });
    } finally {
      await app.close();
      throttlerSpy.mockRestore();
    }
  }, 60_000);

  async function registerAndLogin(label: string): Promise<{ userId: string; accessToken: string }> {
    const email = emailFor(label);
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    return { userId: registerRes.body.data.user.id, accessToken: loginRes.body.data.accessToken };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function grantCredits(userId: string, amount: number, label: string): Promise<void> {
    await creditService.adjustBalance(userId, {
      userId,
      amount,
      type: 'ADMIN_ADJUSTMENT',
      reason: 'Test fixture setup',
      idempotencyKey: `${label}-grant-${randomUUID()}`,
    });
  }

  /** Master Resume + Resume Variant (unlinked) + Job Target, per user. */
  async function setUpVariantAndJobTarget(
    accessToken: string,
  ): Promise<{ variantId: string; jobTargetId: string }> {
    await request(app.getHttpServer()).post('/api/v1/resume').set(auth(accessToken)).send({
      title: 'My Resume',
      summary: 'Experienced backend engineer who has shipped several dashboards for clients.',
      yearsExperience: 6,
    });
    await request(app.getHttpServer())
      .post('/api/v1/resume/skills')
      .set(auth(accessToken))
      .send({ name: 'TypeScript' });
    await request(app.getHttpServer())
      .post('/api/v1/resume/languages')
      .set(auth(accessToken))
      .send({ language: 'English' });
    await request(app.getHttpServer())
      .post('/api/v1/resume/work-experience')
      .set(auth(accessToken))
      .send({
        company: 'Acme',
        position: 'Engineer',
        startDate: '2020-01-01',
        description: 'Led the backend team.',
      });
    await request(app.getHttpServer())
      .post('/api/v1/resume/education')
      .set(auth(accessToken))
      .send({ institution: 'MIT', degree: 'BSc' });

    const jobTargetRes = await request(app.getHttpServer())
      .post('/api/v1/job-targets')
      .set(auth(accessToken))
      .send({
        title: 'Senior Backend Engineer',
        seniority: 'Senior',
        keywords: [{ keyword: 'TypeScript' }],
        skills: [{ skill: 'TypeScript', required: true }],
        languages: [{ language: 'English' }],
      });
    const jobTargetId = jobTargetRes.body.data.id;

    const variantRes = await request(app.getHttpServer())
      .post('/api/v1/resume-variants')
      .set(auth(accessToken))
      .send({ title: 'Pipeline Test Variant' });

    return { variantId: variantRes.body.data.id, jobTargetId };
  }

  // ---------------------------------------------------------------------
  // Authentication & IDOR
  // ---------------------------------------------------------------------

  describe('Authentication & ownership', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/application-pipeline').send({});
      expect(res.status).toBe(401);
    });

    it('rejects starting a pipeline with a Resume Variant belonging to another user', async () => {
      const owner = await registerAndLogin('owner-idor');
      const stranger = await registerAndLogin('stranger-idor');
      const { variantId } = await setUpVariantAndJobTarget(owner.accessToken);
      const { jobTargetId } = await setUpVariantAndJobTarget(stranger.accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/application-pipeline')
        .set(auth(stranger.accessToken))
        .send({ resumeVariantId: variantId, jobTargetId });

      expect(res.status).toBe(404);
    });

    it('rejects starting a pipeline mixing a Variant from user A with a Job Target from user B, even when requested by neither', async () => {
      const userA = await registerAndLogin('mix-a');
      const userB = await registerAndLogin('mix-b');
      const { variantId } = await setUpVariantAndJobTarget(userA.accessToken);
      const { jobTargetId } = await setUpVariantAndJobTarget(userB.accessToken);

      const resAsA = await request(app.getHttpServer())
        .post('/api/v1/application-pipeline')
        .set(auth(userA.accessToken))
        .send({ resumeVariantId: variantId, jobTargetId });

      expect(resAsA.status).toBe(404); // jobTargetId belongs to userB, not userA
    });

    it("one user cannot read or act on another user's pipeline session", async () => {
      const owner = await registerAndLogin('owner-session');
      const stranger = await registerAndLogin('stranger-session');
      const { variantId, jobTargetId } = await setUpVariantAndJobTarget(owner.accessToken);
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/application-pipeline')
        .set(auth(owner.accessToken))
        .send({ resumeVariantId: variantId, jobTargetId });
      const sessionId = startRes.body.data.id;

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/application-pipeline/${sessionId}`)
        .set(auth(stranger.accessToken));
      const stepRes = await request(app.getHttpServer())
        .post(`/api/v1/application-pipeline/${sessionId}/steps/ats`)
        .set(auth(stranger.accessToken));

      expect(getRes.status).toBe(404);
      expect(stepRes.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Start — auto-linking
  // ---------------------------------------------------------------------

  describe('POST /application-pipeline', () => {
    it('links the Resume Variant to the Job Target when starting, if not already linked', async () => {
      const { accessToken } = await registerAndLogin('auto-link');
      const { variantId, jobTargetId } = await setUpVariantAndJobTarget(accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/application-pipeline')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, jobTargetId });
      expect(res.status).toBe(201);
      expect(res.body.data.currentStep).toBe('ATS_ANALYSIS');
      expect(res.body.data.status).toBe('IN_PROGRESS');

      const variantRes = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken));
      expect(variantRes.body.data.jobTargetId).toBe(jobTargetId);
    });
  });

  // ---------------------------------------------------------------------
  // Apply-suggestions guard
  // ---------------------------------------------------------------------

  describe('Step ordering guard', () => {
    it('rejects applying suggestions before the optimization step has run', async () => {
      const { userId, accessToken } = await registerAndLogin('order-guard');
      await grantCredits(userId, 500, 'order-guard');
      const { variantId, jobTargetId } = await setUpVariantAndJobTarget(accessToken);
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/application-pipeline')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, jobTargetId });
      const sessionId = startRes.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/application-pipeline/${sessionId}/steps/apply-suggestions`)
        .set(auth(accessToken))
        .send({ suggestionIds: ['does-not-exist'] });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------
  // Full happy path — every step, real integration, no mocks
  // ---------------------------------------------------------------------

  describe('Full pipeline (happy path)', () => {
    it('walks every step end-to-end, delegating to the real underlying features and finishing with a real Application', async () => {
      const { userId, accessToken } = await registerAndLogin('happy-path');
      await grantCredits(userId, 500, 'happy-path');
      const { variantId, jobTargetId } = await setUpVariantAndJobTarget(accessToken);

      const startRes = await request(app.getHttpServer())
        .post('/api/v1/application-pipeline')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, jobTargetId });
      const sessionId = startRes.body.data.id;

      const atsRes = await request(app.getHttpServer())
        .post(`/api/v1/application-pipeline/${sessionId}/steps/ats`)
        .set(auth(accessToken));
      expect(atsRes.status).toBe(201);
      expect(atsRes.body.data.atsReportId).toBeTruthy();
      expect(atsRes.body.data.currentStep).toBe('OPTIMIZATION');

      const optRes = await request(app.getHttpServer())
        .post(`/api/v1/application-pipeline/${sessionId}/steps/optimization`)
        .set(auth(accessToken))
        .send({});
      expect(optRes.status).toBe(201);
      expect(optRes.body.data.optimizationId).toBeTruthy();
      expect(optRes.body.data.currentStep).toBe('SUGGESTION_REVIEW');

      // Fetch the optimization's own suggestions to apply at least one for real.
      const optimizationDetail = await request(app.getHttpServer())
        .get(`/api/v1/resume-optimization/${optRes.body.data.optimizationId}`)
        .set(auth(accessToken));
      const suggestionIds = (optimizationDetail.body.data.suggestions as { id: string }[])
        .slice(0, 1)
        .map((s) => s.id);

      const applyRes = await request(app.getHttpServer())
        .post(`/api/v1/application-pipeline/${sessionId}/steps/apply-suggestions`)
        .set(auth(accessToken))
        .send({ suggestionIds });
      expect(applyRes.status).toBe(201);
      expect(applyRes.body.data.newAtsReportId).toBeTruthy();
      expect(applyRes.body.data.currentStep).toBe('COVER_LETTER');

      const clRes = await request(app.getHttpServer())
        .post(`/api/v1/application-pipeline/${sessionId}/steps/cover-letter`)
        .set(auth(accessToken))
        .send({ tone: 'PROFESSIONAL', language: 'pt-MZ' });
      expect(clRes.status).toBe(201);
      expect(clRes.body.data.coverLetterId).toBeTruthy();
      expect(clRes.body.data.currentStep).toBe('INTERVIEW_PREP');

      const ivRes = await request(app.getHttpServer())
        .post(`/api/v1/application-pipeline/${sessionId}/steps/interview`)
        .set(auth(accessToken))
        .send({ type: 'MIXED', difficulty: 'MID', language: 'pt-MZ' });
      expect(ivRes.status).toBe(201);
      expect(ivRes.body.data.interviewSessionId).toBeTruthy();
      expect(ivRes.body.data.currentStep).toBe('EXPORT');

      const balanceBeforeExport =
        (await prisma.creditWallet.findUnique({ where: { userId } }))?.availableCredits ?? 0;
      const exportRes = await request(app.getHttpServer())
        .post(`/api/v1/application-pipeline/${sessionId}/steps/export`)
        .set(auth(accessToken))
        .send({ format: 'PDF' });
      expect(exportRes.status).toBe(201);
      expect(exportRes.headers['content-type']).toBe('application/pdf');
      const balanceAfterExport =
        (await prisma.creditWallet.findUnique({ where: { userId } }))?.availableCredits ?? 0;
      expect(balanceBeforeExport - balanceAfterExport).toBe(10);

      const afterExportSession = await request(app.getHttpServer())
        .get(`/api/v1/application-pipeline/${sessionId}`)
        .set(auth(accessToken));
      expect(afterExportSession.body.data.exportedDocumentId).toBeTruthy();
      expect(afterExportSession.body.data.currentStep).toBe('FINALIZE');

      const finalizeRes = await request(app.getHttpServer())
        .post(`/api/v1/application-pipeline/${sessionId}/steps/finalize`)
        .set(auth(accessToken))
        .send({ status: 'APPLIED' });
      expect(finalizeRes.status).toBe(201);
      expect(finalizeRes.body.data.session.applicationId).toBeTruthy();
      expect(finalizeRes.body.data.session.currentStep).toBe('SUMMARY');
      expect(finalizeRes.body.data.session.status).toBe('COMPLETED');
      expect(finalizeRes.body.data.application.status).toBe('APPLIED');
      expect(finalizeRes.body.data.application.jobTargetId).toBe(jobTargetId);
      expect(finalizeRes.body.data.application.resumeVariantId).toBe(variantId);

      // The Application really exists, independent of the pipeline session.
      const applicationsList = await request(app.getHttpServer())
        .get('/api/v1/applications')
        .set(auth(accessToken));
      expect(
        applicationsList.body.data.some(
          (a: { id: string }) => a.id === finalizeRes.body.data.application.id,
        ),
      ).toBe(true);
    }, 60_000);
  });

  // ---------------------------------------------------------------------
  // Abandon
  // ---------------------------------------------------------------------

  describe('PUT /application-pipeline/:id/abandon', () => {
    it('marks a session ABANDONED', async () => {
      const { accessToken } = await registerAndLogin('abandon');
      const { variantId, jobTargetId } = await setUpVariantAndJobTarget(accessToken);
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/application-pipeline')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, jobTargetId });
      const sessionId = startRes.body.data.id;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/application-pipeline/${sessionId}/abandon`)
        .set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ABANDONED');
    });
  });
});
