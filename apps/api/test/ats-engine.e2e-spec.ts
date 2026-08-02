import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';
import { waitForHistoryEventTypes } from './utils/wait-for-history-events';

/**
 * Covers the Phase 4 ATS Analysis Engine end-to-end against the real
 * Postgres/Redis from docker-compose.yml: fully deterministic scoring
 * (no AI anywhere), append-only report creation, list/get/delete (a real
 * physical delete — see the AtsReport model comment), cross-user
 * isolation, and history events.
 */
describe('ATS Analysis Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `ats-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `ats-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        const resumes = await prisma.masterResume.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const resumeIds = resumes.map((r) => r.id);

        await prisma.$transaction([
          prisma.atsReport.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.application.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.resumeVariant.deleteMany({ where: { userId: { in: userIds } } }),
        ]);

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
          prisma.historyEvent.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.verificationToken.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.user.deleteMany({ where: { id: { in: userIds } } }),
        ]);
      }
    } finally {
      await app.close();
      throttlerSpy.mockRestore();
    }
  });

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

  /** Sets up a Master Resume, a Job Target with known keywords/skills/languages, and a linked Resume Variant — the fixture used by every scoring test. */
  async function setUpVariantWithLinkedJobTarget(
    accessToken: string,
  ): Promise<{ variantId: string; jobTargetId: string }> {
    await request(app.getHttpServer()).post('/api/v1/resume').set(auth(accessToken)).send({
      title: 'My Resume',
      summary:
        'Experienced backend engineer who has shipped several Power BI dashboards for clients.',
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
        description: 'Led the backend team and shipped several major features.',
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
        keywords: [{ keyword: 'Power BI' }, { keyword: 'Kubernetes' }],
        skills: [
          { skill: 'TypeScript', required: true },
          { skill: 'Docker', required: false },
        ],
        languages: [{ language: 'English' }],
      });
    const jobTargetId = jobTargetRes.body.data.id;

    const variantRes = await request(app.getHttpServer())
      .post('/api/v1/resume-variants')
      .set(auth(accessToken))
      .send({ title: 'Tailored for this role', jobTargetId });

    return { variantId: variantRes.body.data.id, jobTargetId };
  }

  // ---------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------

  describe('POST /ats/run', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .send({ resumeVariantId: 'x' });
      expect(res.status).toBe(401);
    });

    it('rejects a variant with no linked job target', async () => {
      const { accessToken } = await registerAndLogin('no-job-target');
      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'R' });
      const variant = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'Untargeted' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variant.body.data.id });
      expect(res.status).toBe(400);
    });

    it('produces deterministic, correctly-shaped scores/matches/recommendations', async () => {
      const { accessToken } = await registerAndLogin('scoring');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });

      expect(res.status).toBe(201);
      const report = res.body.data;

      // Keywords: 'Power BI' appears in the summary, 'Kubernetes' does not.
      expect(report.matchedKeywords).toEqual(['Power BI']);
      expect(report.missingKeywords).toEqual(['Kubernetes']);
      expect(report.keywordScore).toBe(50);

      // Skills: required TypeScript matched, optional Docker missing.
      expect(report.recommendedSkills).toEqual(['Docker']);
      expect(report.skillsScore).toBe(67);

      // Education: exactly one entry -> 70.
      expect(report.educationScore).toBe(70);

      // Languages: English required and present -> 100.
      expect(report.languageScore).toBe(100);

      // Experience: Senior requires 5y, resume declares 6y -> 100.
      expect(report.experienceScore).toBe(100);

      // Well-formed content (summary >= 40 chars, achievements present, no duplicate skills) -> 100.
      expect(report.formattingScore).toBe(100);

      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);

      expect(report.recommendations).toContain(
        "Include the keyword 'Kubernetes' in your experience.",
      );
      expect(report.recommendations).toContain("Add the skill 'Docker' to your resume.");
    });

    it('running again creates a second, independent report — never overwrites', async () => {
      const { accessToken } = await registerAndLogin('append-only');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const first = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });
      const second = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });

      expect(first.body.data.id).not.toBe(second.body.data.id);

      const list = await request(app.getHttpServer())
        .get('/api/v1/ats/reports')
        .set(auth(accessToken));
      expect(list.body.data).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------
  // List / Get
  // ---------------------------------------------------------------------

  describe('GET /ats/reports', () => {
    it('lists and gets a single report, owner-only', async () => {
      const userA = await registerAndLogin('list-get-a');
      const userB = await registerAndLogin('list-get-b');
      const { variantId } = await setUpVariantWithLinkedJobTarget(userA.accessToken);
      const created = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .set(auth(userA.accessToken))
        .send({ resumeVariantId: variantId });

      const getOwn = await request(app.getHttpServer())
        .get(`/api/v1/ats/reports/${created.body.data.id}`)
        .set(auth(userA.accessToken));
      expect(getOwn.status).toBe(200);

      const getCross = await request(app.getHttpServer())
        .get(`/api/v1/ats/reports/${created.body.data.id}`)
        .set(auth(userB.accessToken));
      expect(getCross.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------

  describe('DELETE /ats/reports/:id', () => {
    it('performs a real, physical delete — the row is actually gone, not just soft-deleted', async () => {
      const { accessToken } = await registerAndLogin('delete');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const created = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });
      const id = created.body.data.id;

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/ats/reports/${id}`)
        .set(auth(accessToken));
      expect(deleteRes.status).toBe(200);

      const list = await request(app.getHttpServer())
        .get('/api/v1/ats/reports')
        .set(auth(accessToken));
      expect(list.body.data).toHaveLength(0);

      const stillThere = await prisma.atsReport.findUnique({ where: { id } });
      expect(stillThere).toBeNull();
    });

    it('a user cannot delete another user’s report', async () => {
      const userA = await registerAndLogin('delete-isolation-a');
      const userB = await registerAndLogin('delete-isolation-b');
      const { variantId } = await setUpVariantWithLinkedJobTarget(userA.accessToken);
      const created = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .set(auth(userA.accessToken))
        .send({ resumeVariantId: variantId });

      const bDelete = await request(app.getHttpServer())
        .delete(`/api/v1/ats/reports/${created.body.data.id}`)
        .set(auth(userB.accessToken));
      expect(bDelete.status).toBe(404);

      const stillThere = await prisma.atsReport.findUnique({ where: { id: created.body.data.id } });
      expect(stillThere).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Cross-user isolation — running against another user's variant
  // ---------------------------------------------------------------------

  describe('Cross-user isolation', () => {
    it('a user cannot run ATS analysis against another user’s resume variant', async () => {
      const userA = await registerAndLogin('run-isolation-a');
      const userB = await registerAndLogin('run-isolation-b');
      const { variantId } = await setUpVariantWithLinkedJobTarget(userA.accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .set(auth(userB.accessToken))
        .send({ resumeVariantId: variantId });
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // History events
  // ---------------------------------------------------------------------

  describe('History events', () => {
    it('records ats_report_created and ats_report_deleted', async () => {
      const { userId, accessToken } = await registerAndLogin('history');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const created = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });
      await request(app.getHttpServer())
        .delete(`/api/v1/ats/reports/${created.body.data.id}`)
        .set(auth(accessToken));

      const eventTypes = await waitForHistoryEventTypes(prisma, userId, [
        'ats_report_created',
        'ats_report_deleted',
      ]);

      expect(eventTypes).toContain('ats_report_created');
      expect(eventTypes).toContain('ats_report_deleted');
    });
  });
});
