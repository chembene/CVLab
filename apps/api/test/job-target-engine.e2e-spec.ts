import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';

/**
 * Covers the Phase 2B Job Target Engine end-to-end against the real
 * Postgres/Redis from docker-compose.yml: JobTarget CRUD (including its
 * three replace-on-write child collections), Application CRUD scoped to a
 * job target the same user owns, cross-user isolation, soft delete, and
 * the "archived"/"status_changed" history-event branching.
 */
describe('Job Target Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `jobtarget-e2e-${testRunId}-${label}@example.com`;
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
        where: { email: { contains: `jobtarget-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        const jobTargets = await prisma.jobTarget.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const jobTargetIds = jobTargets.map((jt) => jt.id);

        await prisma.$transaction([
          prisma.application.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.jobTargetAnalysis.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
          prisma.jobTargetKeyword.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
          prisma.jobTargetSkill.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
          prisma.jobTargetLanguage.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
        ]);

        await prisma.$transaction([
          prisma.jobTarget.deleteMany({ where: { userId: { in: userIds } } }),
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

  // ---------------------------------------------------------------------
  // Job Targets
  // ---------------------------------------------------------------------

  describe('Job Targets', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/job-targets');
      expect(res.status).toBe(401);
    });

    it('creates with nested keywords/skills/languages, lists, and gets one', async () => {
      const { accessToken } = await registerAndLogin('create');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({
          title: 'Backend Engineer',
          company: 'Acme Corp',
          jobUrl: 'https://example.com/jobs/123',
          jobDescription: 'Build and maintain backend services.',
          keywords: [{ keyword: 'nestjs', weight: 5 }],
          skills: [{ skill: 'TypeScript', required: true }, { skill: 'PostgreSQL' }],
          languages: [{ language: 'English', level: 'FLUENT' }],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.status).toBe('DRAFT');
      expect(createRes.body.data.jobUrl).toBe('https://example.com/jobs/123');
      expect(createRes.body.data.keywords).toEqual([
        expect.objectContaining({ keyword: 'nestjs', weight: 5 }),
      ]);
      expect(createRes.body.data.skills).toHaveLength(2);
      expect(createRes.body.data.languages).toEqual([
        expect.objectContaining({ language: 'English', level: 'FLUENT' }),
      ]);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/job-targets')
        .set(auth(accessToken));
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);

      const getOneRes = await request(app.getHttpServer())
        .get(`/api/v1/job-targets/${createRes.body.data.id}`)
        .set(auth(accessToken));
      expect(getOneRes.status).toBe(200);
      expect(getOneRes.body.data.title).toBe('Backend Engineer');
    });

    it('rejects a missing title and an invalid job URL', async () => {
      const { accessToken } = await registerAndLogin('validation');

      const missingTitle = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({});
      expect(missingTitle.status).toBe(400);

      const badUrl = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({ title: 'Role', jobUrl: 'not-a-url' });
      expect(badUrl.status).toBe(400);
    });

    it('stores the job URL and description exactly as entered, with no fetching/parsing', async () => {
      const { accessToken } = await registerAndLogin('url-verbatim');
      const jobDescription = 'Line one.\nLine two with "quotes" and a URL http://example.com/x.';

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({ title: 'Role', jobUrl: 'https://example.com/careers/42?ref=abc', jobDescription });

      expect(createRes.body.data.jobUrl).toBe('https://example.com/careers/42?ref=abc');
      expect(createRes.body.data.jobDescription).toBe(jobDescription);
    });

    it('PUT replaces provided child collections and leaves omitted ones untouched', async () => {
      const { accessToken } = await registerAndLogin('replace-children');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({
          title: 'Role',
          skills: [{ skill: 'Go' }],
          languages: [{ language: 'Portuguese' }],
        });
      const id = createRes.body.data.id;

      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/job-targets/${id}`)
        .set(auth(accessToken))
        .send({ skills: [{ skill: 'Rust' }] }); // languages omitted — must be left alone

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.skills).toEqual([expect.objectContaining({ skill: 'Rust' })]);
      expect(updateRes.body.data.languages).toEqual([
        expect.objectContaining({ language: 'Portuguese' }),
      ]);
    });

    it('DELETE soft-deletes only — the row still exists with deletedAt set', async () => {
      const { accessToken } = await registerAndLogin('soft-delete');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({ title: 'To be removed' });
      const id = createRes.body.data.id;

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/job-targets/${id}`)
        .set(auth(accessToken));
      expect(deleteRes.status).toBe(200);

      const listAfter = await request(app.getHttpServer())
        .get('/api/v1/job-targets')
        .set(auth(accessToken));
      expect(listAfter.body.data).toHaveLength(0);

      const stillExists = await prisma.jobTarget.findUnique({ where: { id } });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.deletedAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Cross-user isolation — Job Targets
  // ---------------------------------------------------------------------

  describe('Job Targets — cross-user isolation', () => {
    it('one user cannot read, update, or delete another user’s job target', async () => {
      const userA = await registerAndLogin('jt-isolation-a');
      const userB = await registerAndLogin('jt-isolation-b');

      const created = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(userA.accessToken))
        .send({ title: 'A’s role' });
      const id = created.body.data.id;

      const bGet = await request(app.getHttpServer())
        .get(`/api/v1/job-targets/${id}`)
        .set(auth(userB.accessToken));
      expect(bGet.status).toBe(404);

      const bUpdate = await request(app.getHttpServer())
        .put(`/api/v1/job-targets/${id}`)
        .set(auth(userB.accessToken))
        .send({ title: 'Hijacked' });
      expect(bUpdate.status).toBe(404);

      const bDelete = await request(app.getHttpServer())
        .delete(`/api/v1/job-targets/${id}`)
        .set(auth(userB.accessToken));
      expect(bDelete.status).toBe(404);

      const stillThere = await prisma.jobTarget.findUnique({ where: { id } });
      expect(stillThere?.deletedAt).toBeNull();
      expect(stillThere?.title).toBe('A’s role');
    });
  });

  // ---------------------------------------------------------------------
  // Applications
  // ---------------------------------------------------------------------

  describe('Applications', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/applications');
      expect(res.status).toBe(401);
    });

    it('creates an application against the user’s own job target, and lists it', async () => {
      const { accessToken } = await registerAndLogin('app-create');

      const jobTarget = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({ title: 'Target role' });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set(auth(accessToken))
        .send({ jobTargetId: jobTarget.body.data.id, appliedAt: '2026-08-01' });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.status).toBe('SAVED');
      expect(createRes.body.data.jobTargetId).toBe(jobTarget.body.data.id);
      expect(createRes.body.data.appliedAt).toContain('2026-08-01');

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/applications')
        .set(auth(accessToken));
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
    });

    it('rejects creating an application against another user’s job target', async () => {
      const userA = await registerAndLogin('app-isolation-a');
      const userB = await registerAndLogin('app-isolation-b');

      const aJobTarget = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(userA.accessToken))
        .send({ title: 'A’s role' });

      const bAttempt = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set(auth(userB.accessToken))
        .send({ jobTargetId: aJobTarget.body.data.id });

      expect(bAttempt.status).toBe(404);
    });

    it('rejects a missing jobTargetId', async () => {
      const { accessToken } = await registerAndLogin('app-validation');
      const res = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set(auth(accessToken))
        .send({});
      expect(res.status).toBe(400);
    });

    it('PUT updates status and other fields; jobTargetId in the body is ignored/rejected by whitelist', async () => {
      const { accessToken } = await registerAndLogin('app-update');

      const jobTarget = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({ title: 'Role' });
      const created = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set(auth(accessToken))
        .send({ jobTargetId: jobTarget.body.data.id });

      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/applications/${created.body.data.id}`)
        .set(auth(accessToken))
        .send({ status: 'APPLIED', notes: 'Submitted via referral' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe('APPLIED');
      expect(updateRes.body.data.notes).toBe('Submitted via referral');
    });

    it('DELETE soft-deletes only', async () => {
      const { accessToken } = await registerAndLogin('app-delete');

      const jobTarget = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({ title: 'Role' });
      const created = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set(auth(accessToken))
        .send({ jobTargetId: jobTarget.body.data.id });

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/applications/${created.body.data.id}`)
        .set(auth(accessToken));
      expect(deleteRes.status).toBe(200);

      const listAfter = await request(app.getHttpServer())
        .get('/api/v1/applications')
        .set(auth(accessToken));
      expect(listAfter.body.data).toHaveLength(0);

      const stillExists = await prisma.application.findUnique({
        where: { id: created.body.data.id },
      });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.deletedAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // History events
  // ---------------------------------------------------------------------

  describe('History events', () => {
    it('records job_target_created, job_target_archived (not a second job_target_updated), and application_created / application_status_changed', async () => {
      const { userId, accessToken } = await registerAndLogin('history');

      const jobTarget = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({ title: 'Role' });
      const jobTargetId = jobTarget.body.data.id;

      await request(app.getHttpServer())
        .put(`/api/v1/job-targets/${jobTargetId}`)
        .set(auth(accessToken))
        .send({ status: 'ARCHIVED' });

      const application = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set(auth(accessToken))
        .send({ jobTargetId });

      await request(app.getHttpServer())
        .put(`/api/v1/applications/${application.body.data.id}`)
        .set(auth(accessToken))
        .send({ status: 'APPLIED' });

      const events = await prisma.historyEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      const eventTypes = events.map((e) => e.eventType);

      expect(eventTypes).toContain('job_target_created');
      expect(eventTypes).toContain('job_target_archived');
      expect(eventTypes).not.toContain('job_target_updated');
      expect(eventTypes).toContain('application_created');
      expect(eventTypes).toContain('application_status_changed');
    });
  });
});
