import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';

/**
 * Covers the Phase 2A Resume Engine foundation end-to-end against the real
 * Postgres/Redis from docker-compose.yml: Profile, MasterResume (single-
 * per-user, completion%), and a representative depth-first pass over the
 * generic section engine (full CRUD + duplicate detection + date handling
 * + reordering + cross-user isolation + history events), plus a wiring
 * smoke pass across the remaining section types.
 */
describe('Resume Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `resume-e2e-${testRunId}-${label}@example.com`;
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
        where: { email: { contains: `resume-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
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
            prisma.certificate.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.project.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.course.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.award.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.publication.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.volunteerExperience.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.reference.deleteMany({ where: { resumeId: { in: resumeIds } } }),
          ]);
        }

        await prisma.$transaction([
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

  // ---------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------

  describe('Profile', () => {
    it('GET returns null before any save, requires authentication, and PUT upserts personal info', async () => {
      const { accessToken } = await registerAndLogin('profile');

      const unauth = await request(app.getHttpServer()).get('/api/v1/profile');
      expect(unauth.status).toBe(401);

      const beforeSave = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set(auth(accessToken));
      expect(beforeSave.status).toBe(200);
      expect(beforeSave.body.data).toBeNull();

      const putRes = await request(app.getHttpServer())
        .put('/api/v1/profile')
        .set(auth(accessToken))
        .send({ firstName: 'Jane', lastName: 'Doe', linkedin: 'https://linkedin.com/in/jane' });
      expect(putRes.status).toBe(200);
      expect(putRes.body.data.firstName).toBe('Jane');

      const afterSave = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set(auth(accessToken));
      expect(afterSave.body.data.lastName).toBe('Doe');
    });

    it('rejects an invalid URL field', async () => {
      const { accessToken } = await registerAndLogin('profile-invalid');
      const res = await request(app.getHttpServer())
        .put('/api/v1/profile')
        .set(auth(accessToken))
        .send({ linkedin: 'not-a-url' });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------
  // Master Resume
  // ---------------------------------------------------------------------

  describe('Master Resume', () => {
    it('GET returns null before creation; POST creates with server-side defaults; a second POST is rejected (one per user)', async () => {
      const { accessToken } = await registerAndLogin('resume');

      const beforeCreate = await request(app.getHttpServer())
        .get('/api/v1/resume')
        .set(auth(accessToken));
      expect(beforeCreate.body.data).toBeNull();

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'My Resume', summary: 'Experienced engineer' });
      expect(createRes.status).toBe(201);
      expect(createRes.body.data.status).toBe('DRAFT');
      expect(createRes.body.data.currency).toBe('MZN');
      expect(createRes.body.data.completionPercentage).toEqual(expect.any(Number));

      const secondCreate = await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'Duplicate' });
      expect(secondCreate.status).toBe(409);
    });

    it('PUT updates an existing resume; PUT without a prior POST is rejected', async () => {
      const { accessToken } = await registerAndLogin('resume-update');

      const withoutCreate = await request(app.getHttpServer())
        .put('/api/v1/resume')
        .set(auth(accessToken))
        .send({ summary: 'x' });
      expect(withoutCreate.status).toBe(404);

      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'Initial' });
      const updateRes = await request(app.getHttpServer())
        .put('/api/v1/resume')
        .set(auth(accessToken))
        .send({ summary: 'Updated summary' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.summary).toBe('Updated summary');
    });
  });

  // ---------------------------------------------------------------------
  // Sections — representative full-depth coverage
  // ---------------------------------------------------------------------

  describe('Sections — skills (single-field duplicate detection, reordering)', () => {
    it('requires a master resume to exist first', async () => {
      const { accessToken } = await registerAndLogin('skills-no-resume');
      const res = await request(app.getHttpServer())
        .post('/api/v1/resume/skills')
        .set(auth(accessToken))
        .send({ name: 'Go' });
      expect(res.status).toBe(404);
    });

    it('supports full CRUD, rejects case-insensitive duplicates, and reorders', async () => {
      const { accessToken } = await registerAndLogin('skills');
      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'R' });

      const create1 = await request(app.getHttpServer())
        .post('/api/v1/resume/skills')
        .set(auth(accessToken))
        .send({ name: 'TypeScript', category: 'Programming' });
      expect(create1.status).toBe(201);
      expect(create1.body.data.displayOrder).toBe(0);

      const create2 = await request(app.getHttpServer())
        .post('/api/v1/resume/skills')
        .set(auth(accessToken))
        .send({ name: 'Go' });
      expect(create2.body.data.displayOrder).toBe(1);

      const duplicate = await request(app.getHttpServer())
        .post('/api/v1/resume/skills')
        .set(auth(accessToken))
        .send({ name: 'typescript' }); // case-insensitive collision
      expect(duplicate.status).toBe(409);

      const missingName = await request(app.getHttpServer())
        .post('/api/v1/resume/skills')
        .set(auth(accessToken))
        .send({});
      expect(missingName.status).toBe(400);

      const list = await request(app.getHttpServer())
        .get('/api/v1/resume/skills')
        .set(auth(accessToken));
      expect(list.body.data).toHaveLength(2);

      const reorder = await request(app.getHttpServer())
        .put('/api/v1/resume/skills/reorder')
        .set(auth(accessToken))
        .send({ orderedIds: [create2.body.data.id, create1.body.data.id] });
      expect(reorder.status).toBe(200);
      expect(reorder.body.data[0].id).toBe(create2.body.data.id);
      expect(reorder.body.data[0].displayOrder).toBe(0);

      const update = await request(app.getHttpServer())
        .put(`/api/v1/resume/skills/${create1.body.data.id}`)
        .set(auth(accessToken))
        .send({ level: 'Expert' });
      expect(update.status).toBe(200);
      expect(update.body.data.level).toBe('Expert');

      const removeRes = await request(app.getHttpServer())
        .delete(`/api/v1/resume/skills/${create1.body.data.id}`)
        .set(auth(accessToken));
      expect(removeRes.status).toBe(200);

      const listAfterDelete = await request(app.getHttpServer())
        .get('/api/v1/resume/skills')
        .set(auth(accessToken));
      expect(listAfterDelete.body.data).toHaveLength(1);

      // Soft delete only — the row still exists with deletedAt set.
      const stillExists = await prisma.skill.findUnique({ where: { id: create1.body.data.id } });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.deletedAt).not.toBeNull();
    });
  });

  describe('Sections — education (two-field duplicate detection)', () => {
    it('rejects a duplicate institution+degree pair but allows the same institution with a different degree', async () => {
      const { accessToken } = await registerAndLogin('education');
      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'R' });

      const first = await request(app.getHttpServer())
        .post('/api/v1/resume/education')
        .set(auth(accessToken))
        .send({
          institution: 'MIT',
          degree: 'BSc',
          startDate: '2016-09-01',
          endDate: '2020-06-01',
        });
      expect(first.status).toBe(201);
      expect(first.body.data.startDate).toContain('2016-09-01');

      const duplicate = await request(app.getHttpServer())
        .post('/api/v1/resume/education')
        .set(auth(accessToken))
        .send({ institution: 'mit', degree: 'bsc' });
      expect(duplicate.status).toBe(409);

      const differentDegree = await request(app.getHttpServer())
        .post('/api/v1/resume/education')
        .set(auth(accessToken))
        .send({ institution: 'MIT', degree: 'MSc' });
      expect(differentDegree.status).toBe(201);
    });
  });

  describe('Sections — work experience (dates, arrays, currentlyWorking)', () => {
    it('creates with ISO date strings, array fields, and a boolean, without a 500', async () => {
      const { accessToken } = await registerAndLogin('work-experience');
      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'R' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/resume/work-experience')
        .set(auth(accessToken))
        .send({
          company: 'Acme',
          position: 'Engineer',
          startDate: '2020-01-01',
          currentlyWorking: true,
          achievements: ['Shipped X', 'Led Y'],
          technologies: ['TypeScript', 'Node.js'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.startDate).toContain('2020-01-01');
      expect(res.body.data.currentlyWorking).toBe(true);
      expect(res.body.data.achievements).toEqual(['Shipped X', 'Led Y']);

      const missingRequired = await request(app.getHttpServer())
        .post('/api/v1/resume/work-experience')
        .set(auth(accessToken))
        .send({ company: 'Acme' }); // missing position/startDate
      expect(missingRequired.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------
  // Cross-user isolation
  // ---------------------------------------------------------------------

  describe('Cross-user isolation', () => {
    it('one user cannot update or delete another user’s section item, even with their own valid resume', async () => {
      const userA = await registerAndLogin('isolation-a');
      const userB = await registerAndLogin('isolation-b');

      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(userA.accessToken))
        .send({ title: 'A' });
      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(userB.accessToken))
        .send({ title: 'B' });

      const aSkill = await request(app.getHttpServer())
        .post('/api/v1/resume/skills')
        .set(auth(userA.accessToken))
        .send({ name: 'Rust' });

      const bTriesUpdate = await request(app.getHttpServer())
        .put(`/api/v1/resume/skills/${aSkill.body.data.id}`)
        .set(auth(userB.accessToken))
        .send({ level: 'Expert' });
      expect(bTriesUpdate.status).toBe(404);

      const bTriesDelete = await request(app.getHttpServer())
        .delete(`/api/v1/resume/skills/${aSkill.body.data.id}`)
        .set(auth(userB.accessToken));
      expect(bTriesDelete.status).toBe(404);

      // A's skill is untouched.
      const stillThere = await prisma.skill.findUnique({ where: { id: aSkill.body.data.id } });
      expect(stillThere?.deletedAt).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Completion percentage integration
  // ---------------------------------------------------------------------

  describe('Completion percentage', () => {
    it('rises as Profile/MasterResume/sections are filled in', async () => {
      const { accessToken } = await registerAndLogin('completion');

      const created = await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'R' });
      const initialPercentage = created.body.data.completionPercentage;

      await request(app.getHttpServer())
        .put('/api/v1/profile')
        .set(auth(accessToken))
        .send({ firstName: 'Jane', lastName: 'Doe', photoUrl: 'https://example.com/p.jpg' });

      const afterProfile = await request(app.getHttpServer())
        .get('/api/v1/resume')
        .set(auth(accessToken));
      expect(afterProfile.body.data.completionPercentage).toBeGreaterThan(initialPercentage);

      await request(app.getHttpServer())
        .post('/api/v1/resume/skills')
        .set(auth(accessToken))
        .send({ name: 'Go' });

      const afterSkill = await request(app.getHttpServer())
        .get('/api/v1/resume')
        .set(auth(accessToken));
      expect(afterSkill.body.data.completionPercentage).toBeGreaterThan(
        afterProfile.body.data.completionPercentage,
      );
    });
  });

  // ---------------------------------------------------------------------
  // History events
  // ---------------------------------------------------------------------

  describe('History events', () => {
    it('records a history_events row for profile, resume, and section mutations', async () => {
      const { userId, accessToken } = await registerAndLogin('history');

      await request(app.getHttpServer())
        .put('/api/v1/profile')
        .set(auth(accessToken))
        .send({ firstName: 'Jane' });
      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'R' });
      await request(app.getHttpServer())
        .post('/api/v1/resume/skills')
        .set(auth(accessToken))
        .send({ name: 'Kotlin' });

      const events = await prisma.historyEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      const eventTypes = events.map((e) => e.eventType);

      expect(eventTypes).toContain('profile_created');
      expect(eventTypes).toContain('master_resume_created');
      expect(eventTypes).toContain('skill_created');
    });
  });

  // ---------------------------------------------------------------------
  // Wiring smoke pass — the remaining 8 section types
  // ---------------------------------------------------------------------

  describe('Remaining section types — wiring smoke pass', () => {
    const cases: Array<{ path: string; body: Record<string, unknown> }> = [
      { path: 'languages', body: { language: 'Portuguese', proficiency: 'Native' } },
      { path: 'certificates', body: { title: 'AWS Certified', issuer: 'Amazon' } },
      { path: 'projects', body: { title: 'Side Project', technologies: ['React'] } },
      { path: 'courses', body: { title: 'Advanced TypeScript', provider: 'Udemy' } },
      { path: 'awards', body: { title: 'Employee of the Year' } },
      { path: 'publications', body: { title: 'A Paper', publisher: 'IEEE' } },
      { path: 'volunteer-experience', body: { organization: 'Red Cross', role: 'Volunteer' } },
      { path: 'references', body: { name: 'John Smith', email: 'john@example.com' } },
    ];

    it.each(cases)('$path supports create, list, and soft-delete', async ({ path, body }) => {
      const { accessToken } = await registerAndLogin(`wiring-${path}`);
      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'R' });

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/resume/${path}`)
        .set(auth(accessToken))
        .send(body);
      expect(createRes.status).toBe(201);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/resume/${path}`)
        .set(auth(accessToken));
      expect(listRes.body.data).toHaveLength(1);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/resume/${path}/${createRes.body.data.id}`)
        .set(auth(accessToken));
      expect(deleteRes.status).toBe(200);

      const listAfter = await request(app.getHttpServer())
        .get(`/api/v1/resume/${path}`)
        .set(auth(accessToken));
      expect(listAfter.body.data).toHaveLength(0);
    });
  });
});
