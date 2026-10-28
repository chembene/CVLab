import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TemplateEngineService } from '../src/template-engine/template-engine.service';
import { RESUME_TEMPLATE_SEED } from '../src/template-engine/seed/resume-templates.seed';
import { COVER_LETTER_TEMPLATE_SEED } from '../src/template-engine/seed/cover-letter-templates.seed';
import { AIFeature } from '../src/ai-orchestration/constants/ai-feature.enum';
import { CreditService } from '../src/credits/credit.service';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';

const COVER_LETTER_FEATURE_KEY = AIFeature.COVER_LETTER;

/**
 * Covers the Phase 11 Template Engine end-to-end against the real
 * Postgres/Redis from docker-compose.yml: the catalog (list/filter/get,
 * both template types), favorites, recently-used, and the Resume Variant /
 * Cover Letter template+theme endpoints. See
 * docs/architecture/template-engine.md.
 *
 * The 17 built-in templates are real, permanent catalog data (not
 * per-test fixtures) — `beforeAll` upserts them from the exact same seed
 * data `prisma/seed-templates.ts` uses (idempotent, safe to run against a
 * DB that already has them from a real seed run), and `afterAll`
 * deliberately never deletes them — only the per-user data this suite
 * itself created, plus the Cover Letter `feature_pricing` fixture row it
 * self-seeds (globally unique key: see afterAll).
 */
describe('Template Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let templateEngineService: TemplateEngineService;
  let creditService: CreditService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `template-engine-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    templateEngineService = moduleRef.get(TemplateEngineService);
    creditService = moduleRef.get(CreditService);

    for (const row of RESUME_TEMPLATE_SEED) {
      await prisma.resumeTemplate.upsert({ where: { id: row.id }, create: row, update: row });
    }
    for (const row of COVER_LETTER_TEMPLATE_SEED) {
      await prisma.coverLetterTemplate.upsert({ where: { id: row.id }, create: row, update: row });
    }
    // The Cover Letter template/theme tests exercise POST /cover-letter/generate,
    // which requires a priced feature to exist — same self-seed gap/pattern
    // cover-letter.e2e-spec.ts documents (see database-overview.md's
    // `feature_pricing` row).
    await prisma.featurePricing.upsert({
      where: { featureKey: COVER_LETTER_FEATURE_KEY },
      create: { featureKey: COVER_LETTER_FEATURE_KEY, cost: 40, active: true },
      update: { cost: 40, active: true },
    });
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `template-engine-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        // FK order: favorites reference both a user and a template row we
        // deliberately keep; resume_variant_versions reference resume_variants
        // (Phase 10.5's FK, unrelated to this phase but still in the way).
        await prisma.resumeTemplateFavorite.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.coverLetterTemplateFavorite.deleteMany({ where: { userId: { in: userIds } } });

        const variants = await prisma.resumeVariant.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const variantIds = variants.map((v) => v.id);
        if (variantIds.length > 0) {
          await prisma.resumeVariantVersion.deleteMany({
            where: { resumeVariantId: { in: variantIds } },
          });
        }
        await prisma.coverLetter.deleteMany({ where: { userId: { in: userIds } } });
        // Cover-letter generation runs an ATS analysis first (resolveAtsReport()),
        // leaving ats_reports rows FK'd to resume_variants even when the
        // generation itself later fails — same FK-order requirement every
        // other suite touching both tables already follows.
        await prisma.atsReport.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.resumeVariant.deleteMany({ where: { userId: { in: userIds } } });

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
          prisma.user.deleteMany({ where: { id: { in: userIds } } }),
        ]);
      }
    } finally {
      try {
        // The Cover Letter pricing row is a self-seeded test fixture (see
        // beforeAll), not catalog data: `feature_pricing.feature_key` is
        // globally unique, so leaving it behind made every later suite that
        // creates the same key (cover-letter, application-pipeline) fail its
        // beforeAll with a unique-constraint error — only when run after this
        // one, which is why they passed in isolation.
        await prisma.featurePricing.deleteMany({ where: { featureKey: COVER_LETTER_FEATURE_KEY } });
      } finally {
        await app.close();
        throttlerSpy.mockRestore();
      }
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

  async function grantCredits(userId: string, amount: number, label: string): Promise<void> {
    await creditService.adjustBalance(userId, {
      userId,
      amount,
      type: 'ADMIN_ADJUSTMENT',
      reason: 'Test fixture setup',
      idempotencyKey: `${label}-grant-${randomUUID()}`,
    });
  }

  async function setUpMasterResume(accessToken: string): Promise<void> {
    await request(app.getHttpServer())
      .post('/api/v1/resume')
      .set(auth(accessToken))
      .send({ title: 'My Resume', summary: 'Experienced backend engineer' });
  }

  async function createVariant(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/resume-variants')
      .set(auth(accessToken))
      .send({ title: 'V' });
    return res.body.data.id as string;
  }

  // ---------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------

  describe('Authentication', () => {
    it('requires authentication on every template-engine endpoint', async () => {
      const results = await Promise.all([
        request(app.getHttpServer()).get('/api/v1/templates/resume'),
        request(app.getHttpServer()).get('/api/v1/templates/resume/modern'),
        request(app.getHttpServer()).get('/api/v1/templates/cover-letter'),
        request(app.getHttpServer()).get('/api/v1/templates/cover-letter/cl-modern'),
        request(app.getHttpServer()).post('/api/v1/templates/resume/modern/favorite'),
      ]);
      for (const res of results) {
        expect(res.status).toBe(401);
      }
    });
  });

  // ---------------------------------------------------------------------
  // Catalog — Resume Templates
  // ---------------------------------------------------------------------

  describe('GET /templates/resume', () => {
    it('lists all 10 built-in resume templates with no filters', async () => {
      const { accessToken } = await registerAndLogin('catalog-resume');
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates/resume')
        .set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(10);
      const names = res.body.data.map((t: { name: string }) => t.name);
      expect(names).toEqual(
        expect.arrayContaining(['Modern', 'ATS Classic', 'Executive', 'Academic']),
      );
    });

    it('filters by category', async () => {
      const { accessToken } = await registerAndLogin('catalog-resume-cat');
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates/resume?category=ATS_CLASSIC')
        .set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('ATS Classic');
    });

    it('filters by atsFriendly=false — only Creative is not ATS-friendly', async () => {
      const { accessToken } = await registerAndLogin('catalog-resume-ats');
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates/resume?atsFriendly=false')
        .set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.map((t: { id: string }) => t.id)).toEqual(['creative']);
    });

    it('filters by premium=true — Executive and Elegant are premium', async () => {
      const { accessToken } = await registerAndLogin('catalog-resume-premium');
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates/resume?premium=true')
        .set(auth(accessToken));

      expect(res.status).toBe(200);
      const ids = res.body.data.map((t: { id: string }) => t.id).sort();
      expect(ids).toEqual(['elegant', 'executive']);
    });
  });

  describe('GET /templates/resume/:id', () => {
    it('returns full metadata for one template', async () => {
      const { accessToken } = await registerAndLogin('resume-detail');
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates/resume/modern')
        .set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('modern');
      expect(res.body.data.category).toBe('MODERN');
      expect(res.body.data.layout).toBe('sidebar-left');
      expect(res.body.data.isATSFriendly).toBe(true);
      expect(res.body.data.premium).toBe(false);
      expect(res.body.data.supportedSections).toContain('workExperiences');
    });

    it('returns 404 for an unknown template id', async () => {
      const { accessToken } = await registerAndLogin('resume-detail-404');
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates/resume/no-such-template')
        .set(auth(accessToken));
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Catalog — Cover Letter Templates
  // ---------------------------------------------------------------------

  describe('GET /templates/cover-letter', () => {
    it('lists all 7 built-in cover letter templates', async () => {
      const { accessToken } = await registerAndLogin('catalog-cl');
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates/cover-letter')
        .set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(7);
      const names = res.body.data.map((t: { name: string }) => t.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'Professional',
          'Executive',
          'Modern',
          'Corporate',
          'Government',
          'Minimal',
          'Startup',
        ]),
      );
    });
  });

  describe('GET /templates/cover-letter/:id', () => {
    it('returns 404 for an unknown template id', async () => {
      const { accessToken } = await registerAndLogin('cl-detail-404');
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates/cover-letter/no-such')
        .set(auth(accessToken));
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Favorites
  // ---------------------------------------------------------------------

  describe('Resume template favorites', () => {
    it('favoriting, listing, and unfavoriting works, and favoriting is idempotent', async () => {
      const { accessToken } = await registerAndLogin('favorites-resume');

      const favoriteRes = await request(app.getHttpServer())
        .post('/api/v1/templates/resume/executive/favorite')
        .set(auth(accessToken));
      expect(favoriteRes.status).toBe(201);
      expect(favoriteRes.body.data.favorited).toBe(true);

      // Idempotent — favoriting again doesn't error or duplicate.
      const favoriteAgain = await request(app.getHttpServer())
        .post('/api/v1/templates/resume/executive/favorite')
        .set(auth(accessToken));
      expect(favoriteAgain.status).toBe(201);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/templates/resume/favorites')
        .set(auth(accessToken));
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].id).toBe('executive');

      const unfavoriteRes = await request(app.getHttpServer())
        .delete('/api/v1/templates/resume/executive/favorite')
        .set(auth(accessToken));
      expect(unfavoriteRes.status).toBe(200);
      expect(unfavoriteRes.body.data.favorited).toBe(false);

      const listAfter = await request(app.getHttpServer())
        .get('/api/v1/templates/resume/favorites')
        .set(auth(accessToken));
      expect(listAfter.body.data).toHaveLength(0);
    });

    it('favoriting an unknown template returns 404', async () => {
      const { accessToken } = await registerAndLogin('favorites-resume-404');
      const res = await request(app.getHttpServer())
        .post('/api/v1/templates/resume/no-such/favorite')
        .set(auth(accessToken));
      expect(res.status).toBe(404);
    });

    it("one user's favorites never appear for another user", async () => {
      const userA = await registerAndLogin('favorites-isolation-a');
      const userB = await registerAndLogin('favorites-isolation-b');

      await request(app.getHttpServer())
        .post('/api/v1/templates/resume/creative/favorite')
        .set(auth(userA.accessToken));

      const bList = await request(app.getHttpServer())
        .get('/api/v1/templates/resume/favorites')
        .set(auth(userB.accessToken));
      expect(bList.body.data).toHaveLength(0);
    });
  });

  describe('Cover letter template favorites', () => {
    it('favoriting, listing, and unfavoriting works', async () => {
      const { accessToken } = await registerAndLogin('favorites-cl');

      await request(app.getHttpServer())
        .post('/api/v1/templates/cover-letter/cl-startup/favorite')
        .set(auth(accessToken));

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/templates/cover-letter/favorites')
        .set(auth(accessToken));
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].id).toBe('cl-startup');

      await request(app.getHttpServer())
        .delete('/api/v1/templates/cover-letter/cl-startup/favorite')
        .set(auth(accessToken));

      const listAfter = await request(app.getHttpServer())
        .get('/api/v1/templates/cover-letter/favorites')
        .set(auth(accessToken));
      expect(listAfter.body.data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // Recently used
  // ---------------------------------------------------------------------

  describe('Recently used', () => {
    it('a resume variant assigned a template appears in the recently-used list', async () => {
      const { accessToken } = await registerAndLogin('recent-resume');
      await setUpMasterResume(accessToken);
      const variantId = await createVariant(accessToken);

      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}/template`)
        .set(auth(accessToken))
        .send({ templateId: 'technology' });

      const recentRes = await request(app.getHttpServer())
        .get('/api/v1/templates/resume/recent')
        .set(auth(accessToken));

      expect(recentRes.status).toBe(200);
      expect(recentRes.body.data.map((t: { id: string }) => t.id)).toContain('technology');
    });

    it('returns empty when the user has never assigned a template', async () => {
      const { accessToken } = await registerAndLogin('recent-resume-empty');
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates/resume/recent')
        .set(auth(accessToken));
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // Resume Variant — template & theme
  // ---------------------------------------------------------------------

  describe('PUT /resume-variants/:id/template', () => {
    it('assigns a template, is reflected on GET, and never bumps version (presentation-only)', async () => {
      const { accessToken } = await registerAndLogin('rv-template');
      await setUpMasterResume(accessToken);
      const variantId = await createVariant(accessToken);

      const setRes = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}/template`)
        .set(auth(accessToken))
        .send({ templateId: 'minimal' });

      expect(setRes.status).toBe(200);
      expect(setRes.body.data.templateId).toBe('minimal');
      expect(setRes.body.data.version).toBe(1); // unchanged — presentation, not content

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken));
      expect(getRes.body.data.templateId).toBe('minimal');
    });

    it('returns 404 for an unknown templateId', async () => {
      const { accessToken } = await registerAndLogin('rv-template-404');
      await setUpMasterResume(accessToken);
      const variantId = await createVariant(accessToken);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}/template`)
        .set(auth(accessToken))
        .send({ templateId: 'no-such-template' });
      expect(res.status).toBe(404);
    });

    it("rejects assigning a template to another user's variant", async () => {
      const userA = await registerAndLogin('rv-template-iso-a');
      const userB = await registerAndLogin('rv-template-iso-b');
      await setUpMasterResume(userA.accessToken);
      const variantId = await createVariant(userA.accessToken);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}/template`)
        .set(auth(userB.accessToken))
        .send({ templateId: 'modern' });
      expect(res.status).toBe(404);
    });
  });

  describe('PUT / DELETE /resume-variants/:id/theme', () => {
    it('sets theme overrides, and content stays untouched by presentation changes', async () => {
      const { accessToken } = await registerAndLogin('rv-theme');
      await setUpMasterResume(accessToken);
      const variantId = await createVariant(accessToken);
      const before = await request(app.getHttpServer())
        .get(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken));

      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}/theme`)
        .set(auth(accessToken))
        .send({ primaryColor: '#123456', iconsEnabled: true, sectionSpacing: 'compact' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.themeOverrides).toEqual({
        primaryColor: '#123456',
        iconsEnabled: true,
        sectionSpacing: 'compact',
      });
      // Presentation must never alter stored content.
      expect(updateRes.body.data.content).toEqual(before.body.data.content);
      expect(updateRes.body.data.version).toBe(before.body.data.version);

      const resetRes = await request(app.getHttpServer())
        .delete(`/api/v1/resume-variants/${variantId}/theme`)
        .set(auth(accessToken));
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.themeOverrides).toBeNull();
    });

    it('rejects an invalid theme field value', async () => {
      const { accessToken } = await registerAndLogin('rv-theme-invalid');
      await setUpMasterResume(accessToken);
      const variantId = await createVariant(accessToken);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}/theme`)
        .set(auth(accessToken))
        .send({ sectionSpacing: 'not-a-real-option' });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------
  // Cover Letter — template & theme (thinner coverage; same code paths)
  // ---------------------------------------------------------------------

  describe('Cover letter template & theme', () => {
    async function setUpCoverLetter(userId: string, accessToken: string): Promise<{ id: string }> {
      await grantCredits(userId, 200, 'cover-letter-template');
      await setUpMasterResume(accessToken);
      const variantId = await createVariant(accessToken);
      const jobTarget = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({ title: 'Role' });
      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken))
        .send({ jobTargetId: jobTarget.body.data.id });
      const generateRes = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });
      return { id: generateRes.body.data.id as string };
    }

    it('assigns a template and updates the theme, never touching content', async () => {
      const { userId, accessToken } = await registerAndLogin('cl-template-theme');
      const letter = await setUpCoverLetter(userId, accessToken);

      const templateRes = await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${letter.id}/template`)
        .set(auth(accessToken))
        .send({ templateId: 'cl-corporate' });
      expect(templateRes.status).toBe(200);
      expect(templateRes.body.data.templateId).toBe('cl-corporate');

      const themeRes = await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${letter.id}/theme`)
        .set(auth(accessToken))
        .send({ fontFamily: 'Georgia' });
      expect(themeRes.status).toBe(200);
      expect(themeRes.body.data.themeOverrides).toEqual({ fontFamily: 'Georgia' });
      expect(themeRes.body.data.content).toBe(templateRes.body.data.content);
    });
  });

  // ---------------------------------------------------------------------
  // Admin access (self-service-only controllers -> service-level bypass,
  // same established pattern as resume-optimization.e2e-spec.ts)
  // ---------------------------------------------------------------------

  describe('Admin access', () => {
    it("an admin can read another user's favorites via the service-level bypass", async () => {
      const owner = await registerAndLogin('admin-target');
      const admin = await registerAdmin('admin-actor');

      await request(app.getHttpServer())
        .post('/api/v1/templates/resume/academic/favorite')
        .set(auth(owner.accessToken));

      const adminRequestUser = { id: admin.userId, role: 'ADMIN' as const };
      const favorites = await templateEngineService.listFavoriteResumeTemplates(
        adminRequestUser,
        owner.userId,
      );
      expect(favorites.some((t) => t.id === 'academic')).toBe(true);
    });
  });
});
