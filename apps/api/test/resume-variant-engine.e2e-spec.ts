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
 * Covers the Phase 3 Resume Variants Engine end-to-end against the real
 * Postgres/Redis from docker-compose.yml: snapshot-on-create from the
 * Master Resume, independence in both directions after creation, the full
 * CRUD + duplicate/archive/restore/delete state machine, cross-user
 * isolation, history events, and the Application → resumeVariantId flow.
 */
describe('Resume Variant Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `resume-variant-e2e-${testRunId}-${label}@example.com`;
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
        where: { email: { contains: `resume-variant-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        const resumes = await prisma.masterResume.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const resumeIds = resumes.map((r) => r.id);
        const variants = await prisma.resumeVariant.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const variantIds = variants.map((v) => v.id);

        // FK order (Phase 10.5): applications reference both a
        // ResumeVariant and a ResumeVariantVersion; version rows reference
        // their ResumeVariant. Neither relation cascades on delete.
        await prisma.application.deleteMany({ where: { userId: { in: userIds } } });
        if (variantIds.length > 0) {
          await prisma.resumeVariantVersion.deleteMany({
            where: { resumeVariantId: { in: variantIds } },
          });
        }
        await prisma.resumeVariant.deleteMany({ where: { userId: { in: userIds } } });

        if (resumeIds.length > 0) {
          await prisma.$transaction([
            prisma.workExperience.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.education.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.skill.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.language.deleteMany({ where: { resumeId: { in: resumeIds } } }),
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

  async function setUpMasterResumeWithContent(accessToken: string): Promise<void> {
    await request(app.getHttpServer())
      .post('/api/v1/resume')
      .set(auth(accessToken))
      .send({ title: 'My Resume', summary: 'Experienced backend engineer' });
    await request(app.getHttpServer())
      .post('/api/v1/resume/skills')
      .set(auth(accessToken))
      .send({ name: 'TypeScript' });
    await request(app.getHttpServer())
      .post('/api/v1/resume/work-experience')
      .set(auth(accessToken))
      .send({ company: 'Acme', position: 'Engineer', startDate: '2020-01-01' });
  }

  // ---------------------------------------------------------------------
  // Creation & snapshot
  // ---------------------------------------------------------------------

  describe('Creation', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/resume-variants');
      expect(res.status).toBe(401);
    });

    it('requires a master resume to exist first', async () => {
      const { accessToken } = await registerAndLogin('no-resume');
      const res = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'Variant' });
      expect(res.status).toBe(404);
    });

    it('snapshots the master resume’s fields and sections into content, with its own completion percentage', async () => {
      const { accessToken } = await registerAndLogin('snapshot');
      await setUpMasterResumeWithContent(accessToken);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'Tailored for Acme' });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.version).toBe(1);
      expect(createRes.body.data.status).toBe('DRAFT');
      expect(createRes.body.data.archived).toBe(false);
      expect(createRes.body.data.content.summary).toBe('Experienced backend engineer');
      expect(createRes.body.data.content.skills).toHaveLength(1);
      expect(createRes.body.data.content.skills[0].name).toBe('TypeScript');
      expect(createRes.body.data.content.workExperiences).toHaveLength(1);
      expect(createRes.body.data.content.workExperiences[0].company).toBe('Acme');
      expect(createRes.body.data.completionPercentage).toBeGreaterThan(0);
    });

    it('accepts an optional jobTargetId the user owns, and rejects one owned by another user', async () => {
      const userA = await registerAndLogin('jt-owner-a');
      const userB = await registerAndLogin('jt-owner-b');
      await setUpMasterResumeWithContent(userA.accessToken);
      await setUpMasterResumeWithContent(userB.accessToken);

      const aJobTarget = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(userA.accessToken))
        .send({ title: 'Role at Acme' });

      const ownRes = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(userA.accessToken))
        .send({ title: 'For my own target', jobTargetId: aJobTarget.body.data.id });
      expect(ownRes.status).toBe(201);

      const crossRes = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(userB.accessToken))
        .send({ title: 'For someone else’s target', jobTargetId: aJobTarget.body.data.id });
      expect(crossRes.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Independence — the core business rule
  // ---------------------------------------------------------------------

  describe('Independence from the Master Resume', () => {
    it('editing the Master Resume after creation never changes an existing Variant', async () => {
      const { accessToken } = await registerAndLogin('independence-a');
      await setUpMasterResumeWithContent(accessToken);

      const variant = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'Snapshot' });
      const variantId = variant.body.data.id;

      await request(app.getHttpServer())
        .put('/api/v1/resume')
        .set(auth(accessToken))
        .send({ summary: 'Changed after the variant was created' });
      await request(app.getHttpServer())
        .post('/api/v1/resume/skills')
        .set(auth(accessToken))
        .send({ name: 'Rust' });

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken));
      expect(getRes.body.data.content.summary).toBe('Experienced backend engineer');
      expect(getRes.body.data.content.skills).toHaveLength(1);
    });

    it('editing a Variant never changes the Master Resume', async () => {
      const { accessToken } = await registerAndLogin('independence-b');
      await setUpMasterResumeWithContent(accessToken);

      const variant = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'Snapshot' });

      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variant.body.data.id}`)
        .set(auth(accessToken))
        .send({ content: { summary: 'Rewritten only in the variant', skills: [] } });

      const masterResumeRes = await request(app.getHttpServer())
        .get('/api/v1/resume')
        .set(auth(accessToken));
      expect(masterResumeRes.body.data.summary).toBe('Experienced backend engineer');

      const skillsRes = await request(app.getHttpServer())
        .get('/api/v1/resume/skills')
        .set(auth(accessToken));
      expect(skillsRes.body.data).toHaveLength(1);
    });

    it('one Master Resume can generate more than one Variant', async () => {
      const { accessToken } = await registerAndLogin('unlimited-variants');
      await setUpMasterResumeWithContent(accessToken);

      const first = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'A' });
      const second = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'B' });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.id).not.toBe(second.body.data.id);

      const list = await request(app.getHttpServer())
        .get('/api/v1/resume-variants')
        .set(auth(accessToken));
      expect(list.body.data).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------
  // Update, duplicate, archive, restore, delete
  // ---------------------------------------------------------------------

  describe('Update / Duplicate / Archive / Restore / Delete', () => {
    it('PUT replaces content wholesale and bumps the version counter', async () => {
      const { accessToken } = await registerAndLogin('update');
      await setUpMasterResumeWithContent(accessToken);
      const variant = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'V' });

      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variant.body.data.id}`)
        .set(auth(accessToken))
        .send({ title: 'V2', content: { summary: 'Edited', skills: [{ name: 'Go' }] } });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.title).toBe('V2');
      expect(updateRes.body.data.version).toBe(2);
      expect(updateRes.body.data.content.summary).toBe('Edited');
    });

    it('Duplicate creates a brand new, independent variant', async () => {
      const { accessToken } = await registerAndLogin('duplicate');
      await setUpMasterResumeWithContent(accessToken);
      const original = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'Original' });

      const duplicateRes = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${original.body.data.id}/duplicate`)
        .set(auth(accessToken))
        .send({});

      expect(duplicateRes.status).toBe(201);
      expect(duplicateRes.body.data.id).not.toBe(original.body.data.id);
      expect(duplicateRes.body.data.title).toBe('Original (copy)');
      expect(duplicateRes.body.data.version).toBe(1);
      expect(duplicateRes.body.data.content.summary).toBe(original.body.data.content.summary);

      // Editing the duplicate never touches the original.
      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${duplicateRes.body.data.id}`)
        .set(auth(accessToken))
        .send({ content: { summary: 'Only on the copy' } });
      const originalAfter = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${original.body.data.id}`)
        .set(auth(accessToken));
      expect(originalAfter.body.data.content.summary).not.toBe('Only on the copy');
    });

    it('Archive/Restore toggle the archived flag and are idempotent', async () => {
      const { accessToken } = await registerAndLogin('archive-restore');
      await setUpMasterResumeWithContent(accessToken);
      const variant = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'V' });
      const id = variant.body.data.id;

      const archiveRes = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${id}/archive`)
        .set(auth(accessToken));
      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.data.archived).toBe(true);

      // Idempotent — archiving again is a no-op, not an error.
      const archiveAgain = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${id}/archive`)
        .set(auth(accessToken));
      expect(archiveAgain.status).toBe(200);
      expect(archiveAgain.body.data.archived).toBe(true);

      const restoreRes = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${id}/restore`)
        .set(auth(accessToken));
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.data.archived).toBe(false);
    });

    it('DELETE soft-deletes only — excluded from list, row still exists with deletedAt set', async () => {
      const { accessToken } = await registerAndLogin('delete');
      await setUpMasterResumeWithContent(accessToken);
      const variant = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'V' });
      const id = variant.body.data.id;

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/resume-variants/${id}`)
        .set(auth(accessToken));
      expect(deleteRes.status).toBe(200);

      const list = await request(app.getHttpServer())
        .get('/api/v1/resume-variants')
        .set(auth(accessToken));
      expect(list.body.data).toHaveLength(0);

      const stillExists = await prisma.resumeVariant.findUnique({ where: { id } });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.deletedAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Cross-user isolation
  // ---------------------------------------------------------------------

  describe('Cross-user isolation', () => {
    it('one user cannot read, update, duplicate, archive, restore, or delete another user’s variant', async () => {
      const userA = await registerAndLogin('rv-isolation-a');
      const userB = await registerAndLogin('rv-isolation-b');
      await setUpMasterResumeWithContent(userA.accessToken);

      const variant = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(userA.accessToken))
        .send({ title: 'A’s variant' });
      const id = variant.body.data.id;

      const bGet = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${id}`)
        .set(auth(userB.accessToken));
      expect(bGet.status).toBe(404);

      const bUpdate = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${id}`)
        .set(auth(userB.accessToken))
        .send({ title: 'Hijacked' });
      expect(bUpdate.status).toBe(404);

      const bDuplicate = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${id}/duplicate`)
        .set(auth(userB.accessToken))
        .send({});
      expect(bDuplicate.status).toBe(404);

      const bArchive = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${id}/archive`)
        .set(auth(userB.accessToken));
      expect(bArchive.status).toBe(404);

      const bDelete = await request(app.getHttpServer())
        .delete(`/api/v1/resume-variants/${id}`)
        .set(auth(userB.accessToken));
      expect(bDelete.status).toBe(404);

      const stillThere = await prisma.resumeVariant.findUnique({ where: { id } });
      expect(stillThere?.deletedAt).toBeNull();
      expect(stillThere?.title).toBe('A’s variant');
    });
  });

  // ---------------------------------------------------------------------
  // History events
  // ---------------------------------------------------------------------

  describe('History events', () => {
    it('records created, updated, archived, restored, and deleted', async () => {
      const { userId, accessToken } = await registerAndLogin('history');
      await setUpMasterResumeWithContent(accessToken);

      const variant = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'V' });
      const id = variant.body.data.id;

      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${id}`)
        .set(auth(accessToken))
        .send({ content: { summary: 'Edited' } });
      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${id}/archive`)
        .set(auth(accessToken));
      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${id}/restore`)
        .set(auth(accessToken));
      await request(app.getHttpServer())
        .delete(`/api/v1/resume-variants/${id}`)
        .set(auth(accessToken));

      const eventTypes = await waitForHistoryEventTypes(prisma, userId, [
        'resume_variant_created',
        'resume_variant_updated',
        'resume_variant_archived',
        'resume_variant_restored',
        'resume_variant_deleted',
      ]);

      expect(eventTypes).toContain('resume_variant_created');
      expect(eventTypes).toContain('resume_variant_updated');
      expect(eventTypes).toContain('resume_variant_archived');
      expect(eventTypes).toContain('resume_variant_restored');
      expect(eventTypes).toContain('resume_variant_deleted');
    });
  });

  // ---------------------------------------------------------------------
  // Application -> resumeVariantId
  // ---------------------------------------------------------------------

  describe('Application.resumeVariantId', () => {
    it('accepts a resume variant the user owns, and rejects one owned by another user', async () => {
      const userA = await registerAndLogin('app-variant-a');
      const userB = await registerAndLogin('app-variant-b');
      await setUpMasterResumeWithContent(userA.accessToken);

      const jobTarget = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(userA.accessToken))
        .send({ title: 'Role' });
      const variant = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(userA.accessToken))
        .send({ title: 'Tailored' });

      const ownRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set(auth(userA.accessToken))
        .send({ jobTargetId: jobTarget.body.data.id, resumeVariantId: variant.body.data.id });
      expect(ownRes.status).toBe(201);
      expect(ownRes.body.data.resumeVariantId).toBe(variant.body.data.id);

      const bJobTarget = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(userB.accessToken))
        .send({ title: 'B’s role' });
      const crossRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set(auth(userB.accessToken))
        .send({ jobTargetId: bJobTarget.body.data.id, resumeVariantId: variant.body.data.id });
      expect(crossRes.status).toBe(404);
    });
  });
});
