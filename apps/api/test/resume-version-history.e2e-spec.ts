import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResumeVersionService } from '../src/resume-version/resume-version.service';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';
import { waitForHistoryEventTypes } from './utils/wait-for-history-events';

/**
 * Covers the Phase 10.5 Resume Version History engine end-to-end against
 * the real Postgres/Redis from docker-compose.yml: checkpoint/restore/
 * duplicate-from-version on ResumeVariantController, and the read-only
 * timeline/detail/compare endpoints on ResumeVersionController. See
 * docs/architecture/resume-version-history.md.
 */
describe('Resume Version History (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let resumeVersionService: ResumeVersionService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `resume-version-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    resumeVersionService = moduleRef.get(ResumeVersionService);
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `resume-version-e2e-${testRunId}` } },
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

        // FK order: applications -> resumeVariantVersion rows -> resumeVariant
        // rows -> everything else. Applications reference both a
        // ResumeVariant and (Phase 10.5) a ResumeVariantVersion; version
        // rows reference their ResumeVariant — none of these relations
        // cascade on delete, so children must go first.
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

  async function registerAdmin(label: string): Promise<{ userId: string; accessToken: string }> {
    const account = await registerAndLogin(label);
    await prisma.user.update({ where: { id: account.userId }, data: { role: 'ADMIN' } });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailFor(label), password: PASSWORD });
    return { userId: account.userId, accessToken: loginRes.body.data.accessToken };
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
  }

  /** Creates a fresh Resume Variant (version 1, INITIAL) and returns its id. */
  async function createVariant(accessToken: string, title = 'V'): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/resume-variants')
      .set(auth(accessToken))
      .send({ title });
    return res.body.data.id as string;
  }

  // ---------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------

  describe('Authentication', () => {
    it('requires authentication on every new endpoint', async () => {
      const endpoints = [
        request(app.getHttpServer()).get('/api/v1/resume-variants/any-id/versions'),
        request(app.getHttpServer()).get('/api/v1/resume-variants/any-id/versions/1'),
        request(app.getHttpServer()).get(
          '/api/v1/resume-variants/any-id/versions/compare?from=1&to=2',
        ),
        request(app.getHttpServer()).post('/api/v1/resume-variants/any-id/checkpoint'),
        request(app.getHttpServer()).post('/api/v1/resume-variants/any-id/versions/1/restore'),
        request(app.getHttpServer()).post('/api/v1/resume-variants/any-id/versions/1/duplicate'),
      ];
      const results = await Promise.all(endpoints);
      for (const res of results) {
        expect(res.status).toBe(401);
      }
    });
  });

  // ---------------------------------------------------------------------
  // Timeline (GET /versions, GET /versions/:n)
  // ---------------------------------------------------------------------

  describe('GET /resume-variants/:id/versions', () => {
    it("creating a variant records exactly one INITIAL version at versionNumber 1, matching the variant's own version field", async () => {
      const { accessToken } = await registerAndLogin('timeline-initial');
      await setUpMasterResumeWithContent(accessToken);

      const created = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'V' });
      expect(created.body.data.version).toBe(1);

      const timeline = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${created.body.data.id}/versions`)
        .set(auth(accessToken));

      expect(timeline.status).toBe(200);
      expect(timeline.body.data).toHaveLength(1);
      expect(timeline.body.data[0].versionNumber).toBe(1);
      expect(timeline.body.data[0].label).toBe('INITIAL');
      expect(timeline.body.data[0].source).toBe('USER');
    });

    it('a content-changing PUT appends a MANUAL_EDIT version at the next number, newest first', async () => {
      const { accessToken } = await registerAndLogin('timeline-edit');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken))
        .send({ content: { summary: 'Edited', skills: [] } });

      const timeline = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions`)
        .set(auth(accessToken));

      expect(timeline.body.data).toHaveLength(2);
      expect(timeline.body.data[0].versionNumber).toBe(2); // newest first
      expect(timeline.body.data[0].label).toBe('MANUAL_EDIT');
      expect(timeline.body.data[1].versionNumber).toBe(1);
    });

    it('GET /versions/:n returns a specific version', async () => {
      const { accessToken } = await registerAndLogin('timeline-detail');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions/1`)
        .set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.versionNumber).toBe(1);
    });

    it('an invalid/nonexistent version number returns 404', async () => {
      const { accessToken } = await registerAndLogin('invalid-version');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions/999`)
        .set(auth(accessToken));

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Compare
  // ---------------------------------------------------------------------

  describe('GET /resume-variants/:id/versions/compare', () => {
    it('diffs two versions section by section, highlighting added/removed/changed', async () => {
      const { accessToken } = await registerAndLogin('compare');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken))
        // v1 (via setUpMasterResumeWithContent) already has one skill
        // (TypeScript) and no languages — replacing it with Go is a
        // "changed" pair (positional match, no exact-content match), while
        // adding a language where there were none is a pure "added".
        .send({
          content: {
            summary: 'Changed summary',
            skills: [{ name: 'Go' }],
            languages: [{ language: 'French' }],
          },
        });

      const compareRes = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions/compare?from=1&to=2`)
        .set(auth(accessToken));

      expect(compareRes.status).toBe(200);
      expect(compareRes.body.data.fromVersion).toBe(1);
      expect(compareRes.body.data.toVersion).toBe(2);
      const summarySection = compareRes.body.data.sections.find(
        (s: { section: string }) => s.section === 'summary',
      );
      expect(summarySection.status).toBe('changed');
      const skillsSection = compareRes.body.data.sections.find(
        (s: { section: string }) => s.section === 'skills',
      );
      expect(skillsSection.status).toBe('changed');
      const languagesSection = compareRes.body.data.sections.find(
        (s: { section: string }) => s.section === 'languages',
      );
      expect(languagesSection.status).toBe('added');
    });

    it('comparing against a nonexistent version returns 404', async () => {
      const { accessToken } = await registerAndLogin('compare-invalid');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions/compare?from=1&to=999`)
        .set(auth(accessToken));

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Checkpoint ("Save Version")
  // ---------------------------------------------------------------------

  describe('POST /resume-variants/:id/checkpoint', () => {
    it('snapshots the current content unchanged, defaulting to CUSTOM, and bumps the variant version', async () => {
      const { accessToken } = await registerAndLogin('checkpoint');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const checkpointRes = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/checkpoint`)
        .set(auth(accessToken))
        .send({ notes: 'Before applying to Acme' });

      expect(checkpointRes.status).toBe(201);
      expect(checkpointRes.body.data.versionNumber).toBe(2);
      expect(checkpointRes.body.data.label).toBe('CUSTOM');
      expect(checkpointRes.body.data.notes).toBe('Before applying to Acme');

      const variantRes = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken));
      expect(variantRes.body.data.version).toBe(2);
    });

    it('honors an explicit label', async () => {
      const { accessToken } = await registerAndLogin('checkpoint-label');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/checkpoint`)
        .set(auth(accessToken))
        .send({ label: 'INTERVIEW_VERSION' });

      expect(res.body.data.label).toBe('INTERVIEW_VERSION');
    });
  });

  // ---------------------------------------------------------------------
  // Restore
  // ---------------------------------------------------------------------

  describe('POST /resume-variants/:id/versions/:versionNumber/restore', () => {
    it('restoring an older version copies its content back and creates a NEW version rather than overwriting history', async () => {
      const { accessToken } = await registerAndLogin('restore');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);
      const initial = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions/1`)
        .set(auth(accessToken));
      const originalSummary = initial.body.data.content.summary;

      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken))
        .send({ content: { summary: 'Overwritten', skills: [] } });

      const restoreRes = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/1/restore`)
        .set(auth(accessToken));

      expect(restoreRes.status).toBe(201);
      expect(restoreRes.body.data.content.summary).toBe(originalSummary);
      expect(restoreRes.body.data.version).toBe(3); // new version, not overwriting v1

      // History is preserved — v1 and v2 (the overwrite) are still there.
      const timeline = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions`)
        .set(auth(accessToken));
      expect(timeline.body.data).toHaveLength(3);
      const v2 = timeline.body.data.find((v: { versionNumber: number }) => v.versionNumber === 2);
      expect(v2.content.summary).toBe('Overwritten');
    });

    it('restoring the first version (v1) and restoring the latest version both work identically', async () => {
      const { accessToken } = await registerAndLogin('restore-edge');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const restoreFirst = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/1/restore`)
        .set(auth(accessToken));
      expect(restoreFirst.status).toBe(201);
      expect(restoreFirst.body.data.version).toBe(2);

      const restoreLatest = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/2/restore`)
        .set(auth(accessToken));
      expect(restoreLatest.status).toBe(201);
      expect(restoreLatest.body.data.version).toBe(3);
    });

    it('restoring the same version twice in a row ("duplicate restore") succeeds both times, each creating its own version row', async () => {
      const { accessToken } = await registerAndLogin('restore-twice');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const first = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/1/restore`)
        .set(auth(accessToken));
      const second = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/1/restore`)
        .set(auth(accessToken));

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.version).toBe(2);
      expect(second.body.data.version).toBe(3);

      const timeline = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions`)
        .set(auth(accessToken));
      expect(timeline.body.data).toHaveLength(3);
    });

    it('two concurrent restores of the same version each get a distinct, DB-atomic version number — no lost update, no duplicate version number', async () => {
      const { accessToken } = await registerAndLogin('restore-concurrent');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/resume-variants/${variantId}/versions/1/restore`)
          .set(auth(accessToken)),
        request(app.getHttpServer())
          .post(`/api/v1/resume-variants/${variantId}/versions/1/restore`)
          .set(auth(accessToken)),
      ]);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.data.version).not.toBe(b.body.data.version);
      expect([a.body.data.version, b.body.data.version].sort()).toEqual([2, 3]);

      const timeline = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions`)
        .set(auth(accessToken));
      expect(timeline.body.data).toHaveLength(3); // INITIAL + 2 restores, no row lost or duplicated
      const versionNumbers = timeline.body.data
        .map((v: { versionNumber: number }) => v.versionNumber)
        .sort();
      expect(versionNumbers).toEqual([1, 2, 3]);
    });

    it('restoring a nonexistent version returns 404', async () => {
      const { accessToken } = await registerAndLogin('restore-invalid');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/999/restore`)
        .set(auth(accessToken));

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Duplicate-from-version
  // ---------------------------------------------------------------------

  describe('POST /resume-variants/:id/versions/:versionNumber/duplicate', () => {
    it('creates a brand new, completely independent Resume Variant from a historical version', async () => {
      const { accessToken } = await registerAndLogin('dup-version');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken, 'Original');

      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken))
        .send({ content: { summary: 'Edited after v1', skills: [] } });

      const dupRes = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/1/duplicate`)
        .set(auth(accessToken))
        .send({});

      expect(dupRes.status).toBe(201);
      expect(dupRes.body.data.id).not.toBe(variantId);
      expect(dupRes.body.data.title).toBe('Original (v1 copy)');
      expect(dupRes.body.data.version).toBe(1);

      // Editing the duplicate never touches the source.
      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${dupRes.body.data.id}`)
        .set(auth(accessToken))
        .send({ content: { summary: 'Only on the duplicate' } });
      const sourceAfter = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken));
      expect(sourceAfter.body.data.content.summary).not.toBe('Only on the duplicate');
    });

    it('honors a custom title override', async () => {
      const { accessToken } = await registerAndLogin('dup-version-title');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/1/duplicate`)
        .set(auth(accessToken))
        .send({ title: 'My custom copy' });

      expect(res.body.data.title).toBe('My custom copy');
    });

    it('duplicating from a nonexistent version returns 404', async () => {
      const { accessToken } = await registerAndLogin('dup-version-invalid');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/999/duplicate`)
        .set(auth(accessToken))
        .send({});

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Cross-user isolation (ownership)
  // ---------------------------------------------------------------------

  describe('Cross-user isolation', () => {
    it("one user cannot read, checkpoint, restore, or duplicate-from-version another user's variant", async () => {
      const userA = await registerAndLogin('isolation-a');
      const userB = await registerAndLogin('isolation-b');
      await setUpMasterResumeWithContent(userA.accessToken);
      const variantId = await createVariant(userA.accessToken);

      const bTimeline = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions`)
        .set(auth(userB.accessToken));
      // No ownership-of-variant check on the read side (relation-filtered
      // query) — a non-owner simply sees an empty list, not a 404.
      expect(bTimeline.status).toBe(200);
      expect(bTimeline.body.data).toHaveLength(0);

      const bDetail = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions/1`)
        .set(auth(userB.accessToken));
      expect(bDetail.status).toBe(404);

      const bCheckpoint = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/checkpoint`)
        .set(auth(userB.accessToken))
        .send({});
      expect(bCheckpoint.status).toBe(404);

      const bRestore = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/1/restore`)
        .set(auth(userB.accessToken));
      expect(bRestore.status).toBe(404);

      const bDuplicate = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/1/duplicate`)
        .set(auth(userB.accessToken))
        .send({});
      expect(bDuplicate.status).toBe(404);

      // Nothing was actually touched.
      const timeline = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions`)
        .set(auth(userA.accessToken));
      expect(timeline.body.data).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------
  // Admin access (self-service-only controllers -> service-level bypass,
  // same established pattern as resume-optimization.e2e-spec.ts)
  // ---------------------------------------------------------------------

  describe('Admin access', () => {
    it("an admin can read another user's version timeline and compare versions via the service-level bypass", async () => {
      const owner = await registerAndLogin('admin-target');
      const admin = await registerAdmin('admin-actor');
      await setUpMasterResumeWithContent(owner.accessToken);
      const variantId = await createVariant(owner.accessToken);
      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}`)
        .set(auth(owner.accessToken))
        .send({ content: { summary: 'Edited', skills: [] } });

      const adminRequestUser = { id: admin.userId, role: 'ADMIN' as const };
      const timeline = await resumeVersionService.listTimeline(
        adminRequestUser,
        owner.userId,
        variantId,
      );
      expect(timeline).toHaveLength(2);

      const compare = await resumeVersionService.compare(
        adminRequestUser,
        owner.userId,
        variantId,
        1,
        2,
      );
      expect(compare.fromVersion).toBe(1);
      expect(compare.toVersion).toBe(2);
    });
  });

  // ---------------------------------------------------------------------
  // Soft delete
  // ---------------------------------------------------------------------

  describe('Soft delete', () => {
    it('after the Resume Variant is soft-deleted, its version rows are excluded from every relation-filtered query, but survive physically in Postgres', async () => {
      const { accessToken } = await registerAndLogin('soft-delete');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);
      const checkpointRes = await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/checkpoint`)
        .set(auth(accessToken))
        .send({});
      const versionRowId = checkpointRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken));

      const timelineAfterDelete = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions`)
        .set(auth(accessToken));
      expect(timelineAfterDelete.body.data).toHaveLength(0);

      const detailAfterDelete = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}/versions/1`)
        .set(auth(accessToken));
      expect(detailAfterDelete.status).toBe(404);

      // The row is a real, physical survivor — soft-delete on the parent
      // Variant never touches ResumeVariantVersion (append-only, never
      // itself soft-deleted — see docs/architecture/resume-version-history.md).
      const stillExists = await prisma.resumeVariantVersion.findUnique({
        where: { id: versionRowId },
      });
      expect(stillExists).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // History events
  // ---------------------------------------------------------------------

  describe('History events', () => {
    it('records resume_variant_updated for both checkpoint and restore, and resume_variant_created for duplicate-from-version', async () => {
      const { userId, accessToken } = await registerAndLogin('history');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);

      await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/checkpoint`)
        .set(auth(accessToken))
        .send({});
      await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/1/restore`)
        .set(auth(accessToken));
      await request(app.getHttpServer())
        .post(`/api/v1/resume-variants/${variantId}/versions/1/duplicate`)
        .set(auth(accessToken))
        .send({});

      const eventTypes = await waitForHistoryEventTypes(prisma, userId, [
        'resume_variant_created',
        'resume_variant_updated',
      ]);

      expect(eventTypes).toContain('resume_variant_created');
      expect(eventTypes).toContain('resume_variant_updated');
      // created: the initial variant + the duplicate = at least 2.
      expect(
        eventTypes.filter((t) => t === 'resume_variant_created').length,
      ).toBeGreaterThanOrEqual(2);
      // updated: checkpoint + restore = at least 2.
      expect(
        eventTypes.filter((t) => t === 'resume_variant_updated').length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------
  // Application linkage (Part 3)
  // ---------------------------------------------------------------------

  describe('Application -> resumeVariantVersionId', () => {
    it('submitting a resume variant to an application permanently references the exact version snapshot taken at that moment', async () => {
      const { accessToken } = await registerAndLogin('app-linkage');
      await setUpMasterResumeWithContent(accessToken);
      const variantId = await createVariant(accessToken);
      const jobTarget = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({ title: 'Role' });

      const appRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set(auth(accessToken))
        .send({ jobTargetId: jobTarget.body.data.id, resumeVariantId: variantId });

      expect(appRes.status).toBe(201);
      expect(appRes.body.data.resumeVariantVersionId).toBeTruthy();

      const referencedVersion = await prisma.resumeVariantVersion.findUnique({
        where: { id: appRes.body.data.resumeVariantVersionId },
      });
      expect(referencedVersion?.label).toBe('APPLICATION_VERSION');
      expect(referencedVersion?.resumeVariantId).toBe(variantId);

      // Editing the variant afterward never changes what the application
      // recorded — the submitted version is always recoverable exactly as
      // it was.
      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken))
        .send({ content: { summary: 'Edited after applying', skills: [] } });

      const versionAfterEdit = await prisma.resumeVariantVersion.findUnique({
        where: { id: appRes.body.data.resumeVariantVersionId },
      });
      expect((versionAfterEdit?.content as { summary?: string })?.summary).not.toBe(
        'Edited after applying',
      );
    });
  });
});
