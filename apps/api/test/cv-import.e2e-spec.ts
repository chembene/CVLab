import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph } from 'docx';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';

async function buildPdfFixture(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (const line of lines) doc.text(line);
    doc.end();
  });
}

async function buildDocxFixture(lines: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: lines.map((line) => new Paragraph(line)) }],
  });
  return Packer.toBuffer(doc);
}

/**
 * Covers the Phase 10.5 CV Import Engine end-to-end against the real
 * Postgres from docker-compose.yml: PDF upload, DOCX upload, unsupported
 * file rejection, the preview→confirm flow (Master Resume + section
 * creation, "never automatically save"), discard, and cross-user
 * isolation. Fixtures are generated in-memory via pdfkit/docx rather than
 * checked-in binaries, so the same source-of-truth lines this test asserts
 * against are what CVParser actually receives.
 */
describe('CV Import Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `cv-import-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';

  const CV_LINES = [
    'Ana Paula Machava',
    'ana.machava@example.com',
    '+258 82 555 1234',
    'Resumo',
    'Profissional de marketing digital com experiencia em campanhas.',
    'Competencias',
    'SEO, Google Ads, Copywriting',
  ];

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `cv-import-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        const resumes = await prisma.masterResume.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const resumeIds = resumes.map((r) => r.id);

        await prisma.cvImport.deleteMany({ where: { userId: { in: userIds } } });
        if (resumeIds.length > 0) {
          await prisma.$transaction([
            prisma.skill.deleteMany({ where: { resumeId: { in: resumeIds } } }),
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

  it('uploads a PDF, extracts a preview, and never persists Profile/MasterResume before confirm', async () => {
    const { accessToken, userId } = await registerAndLogin('pdf-upload');
    const pdf = await buildPdfFixture(CV_LINES);

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', pdf, { filename: 'cv.pdf', contentType: 'application/pdf' });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.status).toBe('EXTRACTED');
    expect(uploadRes.body.data.extractedData.personalData.email).toBe('ana.machava@example.com');
    expect(uploadRes.body.data.fieldConfidence['personalData.email']).toBeGreaterThan(0.5);

    const resumeCheck = await prisma.masterResume.findFirst({ where: { userId } });
    expect(resumeCheck).toBeNull();
  }, 15000);

  it('uploads a DOCX and extracts the same personal data', async () => {
    const { accessToken } = await registerAndLogin('docx-upload');
    const docx = await buildDocxFixture(CV_LINES);

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', docx, {
        filename: 'cv.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.extractedData.personalData.email).toBe('ana.machava@example.com');
  });

  it('rejects an unsupported file type', async () => {
    const { accessToken } = await registerAndLogin('bad-type');

    const res = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', Buffer.from('not a cv'), { filename: 'cv.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
  });

  it('confirms an import into a brand-new Master Resume + sections, then rejects a second Master Resume', async () => {
    const { accessToken, userId } = await registerAndLogin('confirm-flow');
    const pdf = await buildPdfFixture(CV_LINES);

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', pdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    const importId = uploadRes.body.data.id;

    const confirmRes = await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${importId}/confirm`)
      .set(auth(accessToken))
      .send({});

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.masterResume.userId).toBe(userId);

    const profile = await prisma.profile.findFirst({ where: { userId } });
    expect(profile?.phone).toContain('82');

    const skills = await prisma.skill.findMany({ where: { resume: { userId } } });
    expect(skills.map((s) => s.name)).toEqual(
      expect.arrayContaining(['SEO', 'Google Ads', 'Copywriting']),
    );

    // A second confirm attempt on the same (now CONFIRMED) import is rejected.
    const secondConfirm = await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${importId}/confirm`)
      .set(auth(accessToken))
      .send({});
    expect(secondConfirm.status).toBe(409);
  });

  it('discards a preview without creating any resume data', async () => {
    const { accessToken, userId } = await registerAndLogin('discard-flow');
    const pdf = await buildPdfFixture(CV_LINES);

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', pdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    const importId = uploadRes.body.data.id;

    const discardRes = await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${importId}/discard`)
      .set(auth(accessToken));
    expect(discardRes.status).toBe(201);
    expect(discardRes.body.data.status).toBe('DISCARDED');

    const resume = await prisma.masterResume.findFirst({ where: { userId } });
    expect(resume).toBeNull();
  });

  it('re-importing a second CV against an existing Master Resume updates it instead of 409ing', async () => {
    const { accessToken, userId } = await registerAndLogin('reimport-flow');
    const firstPdf = await buildPdfFixture(CV_LINES);

    const firstUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', firstPdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    const firstConfirm = await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${firstUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({});
    expect(firstConfirm.status).toBe(201);
    const masterResumeId = firstConfirm.body.data.masterResume.id;

    // A second, different CV for the same user — new skill, different summary.
    const secondPdf = await buildPdfFixture([
      'Ana Paula Machava',
      'ana.machava@example.com',
      '+258 82 555 1234',
      'Resumo',
      'Atualizacao do meu perfil profissional.',
      'Competencias',
      'Excel, Data Analysis',
    ]);
    const secondUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', secondPdf, { filename: 'cv2.pdf', contentType: 'application/pdf' });

    const secondConfirm = await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${secondUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({});

    // Previously this would have been a 409 ("A master resume already exists
    // for this user") — the fix makes confirm() update the existing row.
    expect(secondConfirm.status).toBe(201);
    expect(secondConfirm.body.data.masterResume.id).toBe(masterResumeId);

    const resumes = await prisma.masterResume.findMany({ where: { userId } });
    expect(resumes).toHaveLength(1);

    const skills = await prisma.skill.findMany({ where: { resume: { userId } } });
    expect(skills.map((s) => s.name)).toEqual(
      expect.arrayContaining(['SEO', 'Google Ads', 'Copywriting', 'Excel', 'Data Analysis']),
    );
  });

  it('skips a duplicate skill on re-import instead of aborting the whole confirm', async () => {
    const { accessToken, userId } = await registerAndLogin('reimport-dup-flow');
    const pdf = await buildPdfFixture(CV_LINES);

    const firstUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', pdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${firstUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({});

    // Re-uploading the exact same CV means every skill is now a duplicate.
    const secondPdf = await buildPdfFixture(CV_LINES);
    const secondUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', secondPdf, { filename: 'cv2.pdf', contentType: 'application/pdf' });

    const secondConfirm = await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${secondUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({});

    expect(secondConfirm.status).toBe(201);
    expect(
      secondConfirm.body.data.skippedEntries.some((s: string) => s.includes('already exists')),
    ).toBe(true);

    // No duplicate skill rows — still exactly one "SEO", one "Google Ads", one "Copywriting".
    const skills = await prisma.skill.findMany({ where: { resume: { userId } } });
    expect(skills.filter((s) => s.name === 'SEO')).toHaveLength(1);
  });

  it('GET :id/merge-preview reports possible duplicates and new entries before the user ever commits (brief §14/§15)', async () => {
    const { accessToken } = await registerAndLogin('merge-preview-flow');
    const firstPdf = await buildPdfFixture(CV_LINES);

    const firstUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', firstPdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${firstUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({});

    // Second CV: "SEO" repeats (possible duplicate), "Data Analysis" is new.
    const secondPdf = await buildPdfFixture([
      'Ana Paula Machava',
      'ana.machava@example.com',
      '+258 82 555 1234',
      'Competencias',
      'SEO, Data Analysis',
    ]);
    const secondUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', secondPdf, { filename: 'cv2.pdf', contentType: 'application/pdf' });

    const preview = await request(app.getHttpServer())
      .get(`/api/v1/cv-import/${secondUpload.body.data.id}/merge-preview`)
      .set(auth(accessToken));

    expect(preview.status).toBe(200);
    const seoEntry = preview.body.data.skills.find(
      (s: { entry: { name: string } }) => s.entry.name === 'SEO',
    );
    expect(seoEntry).toMatchObject({ entry: { name: 'SEO' }, status: 'possible_duplicate' });
    // FASE 7 audit — the matched existing row's id/fields are projected
    // alongside the classification, so the review screen can render an
    // "Existente vs Importado" diff without a second round-trip.
    expect(typeof seoEntry.existingId).toBe('string');
    expect(seoEntry.existing).toEqual({ name: 'SEO' });

    const dataAnalysisEntry = preview.body.data.skills.find(
      (s: { entry: { name: string } }) => s.entry.name === 'Data Analysis',
    );
    expect(dataAnalysisEntry).toMatchObject({ entry: { name: 'Data Analysis' }, status: 'new' });
    expect(dataAnalysisEntry.existingId).toBeUndefined();

    expect(preview.body.data.duplicateCount).toBeGreaterThanOrEqual(1);
    expect(preview.body.data.newCount).toBeGreaterThanOrEqual(1);

    // Read-only — nothing was actually persisted by asking for the preview.
    const secondCvImport = await request(app.getHttpServer())
      .get(`/api/v1/cv-import/${secondUpload.body.data.id}`)
      .set(auth(accessToken));
    expect(secondCvImport.body.data.status).toBe('EXTRACTED');
  });

  it('strategy:"replace" (brief §13/§35) wipes the existing sections and imports fresh, instead of merging', async () => {
    const { accessToken, userId } = await registerAndLogin('replace-strategy-flow');
    const firstPdf = await buildPdfFixture(CV_LINES);

    const firstUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', firstPdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${firstUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({});

    const skillsBefore = await prisma.skill.findMany({
      where: { resume: { userId }, deletedAt: null },
    });
    expect(skillsBefore.map((s) => s.name)).toEqual(
      expect.arrayContaining(['SEO', 'Google Ads', 'Copywriting']),
    );

    // A completely different second CV — none of its skills overlap the first.
    const secondPdf = await buildPdfFixture([
      'Ana Paula Machava',
      'ana.machava@example.com',
      '+258 82 555 1234',
      'Competencias',
      'Rust, Kubernetes',
    ]);
    const secondUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', secondPdf, { filename: 'cv2.pdf', contentType: 'application/pdf' });

    const secondConfirm = await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${secondUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({ strategy: 'replace' });

    expect(secondConfirm.status).toBe(201);

    const skillsAfter = await prisma.skill.findMany({
      where: { resume: { userId }, deletedAt: null },
    });
    // The first CV's skills are gone (soft-deleted) — "replace" really means replace.
    expect(skillsAfter.map((s) => s.name)).toEqual(expect.arrayContaining(['Rust', 'Kubernetes']));
    expect(skillsAfter.map((s) => s.name)).not.toEqual(expect.arrayContaining(['SEO']));
  });

  it('mergeDecision (FASE 7 audit): "use_imported" updates the matched existing row in place instead of creating a duplicate', async () => {
    const { accessToken, userId } = await registerAndLogin('merge-decision-flow');
    const firstPdf = await buildPdfFixture(CV_LINES);

    const firstUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', firstPdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${firstUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({});

    const skillsBefore = await prisma.skill.findMany({
      where: { resume: { userId }, deletedAt: null },
    });
    const seoRowId = skillsBefore.find((s) => s.name === 'SEO')?.id;
    expect(seoRowId).toBeDefined();

    // Second CV repeats "SEO" — the review screen would flag it as a
    // possible duplicate via GET :id/merge-preview and let the user pick
    // "Usar importado" instead of silently creating a second row.
    const secondPdf = await buildPdfFixture([
      'Ana Paula Machava',
      'ana.machava@example.com',
      '+258 82 555 1234',
      'Competencias',
      'SEO',
    ]);
    const secondUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', secondPdf, { filename: 'cv2.pdf', contentType: 'application/pdf' });

    const preview = await request(app.getHttpServer())
      .get(`/api/v1/cv-import/${secondUpload.body.data.id}/merge-preview`)
      .set(auth(accessToken));
    const seoPreviewEntry = preview.body.data.skills.find(
      (s: { entry: { name: string } }) => s.entry.name === 'SEO',
    );
    expect(seoPreviewEntry.existingId).toBe(seoRowId);

    // The user edits the imported value (e.g. fixing casing) and confirms
    // with "Usar importado" against the exact existing row the preview
    // pointed at.
    const secondConfirm = await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${secondUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({
        skills: [
          { name: 'SEO Avançado', mergeDecision: 'use_imported', existingSectionId: seoRowId },
        ],
      });

    expect(secondConfirm.status).toBe(201);
    expect(secondConfirm.body.data.updatedEntries.length).toBe(1);

    // Still exactly one skill row — the existing one was updated, not
    // duplicated.
    const skillsAfter = await prisma.skill.findMany({
      where: { resume: { userId }, deletedAt: null },
    });
    expect(skillsAfter.filter((s) => s.name === 'SEO' || s.name === 'SEO Avançado')).toHaveLength(
      1,
    );
    expect(skillsAfter.find((s) => s.id === seoRowId)?.name).toBe('SEO Avançado');
  });

  it('mergeDecision: "keep_existing" leaves the existing row untouched and creates nothing', async () => {
    const { accessToken, userId } = await registerAndLogin('merge-decision-keep-flow');
    const firstPdf = await buildPdfFixture(CV_LINES);

    const firstUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', firstPdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${firstUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({});

    const skillsBefore = await prisma.skill.findMany({
      where: { resume: { userId }, deletedAt: null },
    });
    const seoRowId = skillsBefore.find((s) => s.name === 'SEO')?.id;

    const secondPdf = await buildPdfFixture([
      'Ana Paula Machava',
      'ana.machava@example.com',
      '+258 82 555 1234',
      'Competencias',
      'SEO',
    ]);
    const secondUpload = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', secondPdf, { filename: 'cv2.pdf', contentType: 'application/pdf' });

    const secondConfirm = await request(app.getHttpServer())
      .post(`/api/v1/cv-import/${secondUpload.body.data.id}/confirm`)
      .set(auth(accessToken))
      .send({
        skills: [{ name: 'SEO', mergeDecision: 'keep_existing', existingSectionId: seoRowId }],
      });

    expect(secondConfirm.status).toBe(201);
    expect(secondConfirm.body.data.keptExistingEntries.length).toBe(1);

    const skillsAfter = await prisma.skill.findMany({
      where: { resume: { userId }, deletedAt: null },
    });
    expect(skillsAfter.filter((s) => s.name === 'SEO')).toHaveLength(1);
    expect(skillsAfter.find((s) => s.id === seoRowId)?.updatedAt).toEqual(
      skillsBefore.find((s) => s.id === seoRowId)?.updatedAt,
    );
  });

  it('isolates CV imports between users', async () => {
    const owner = await registerAndLogin('isolation-owner');
    const stranger = await registerAndLogin('isolation-stranger');
    const pdf = await buildPdfFixture(CV_LINES);

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(owner.accessToken))
      .attach('file', pdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    const importId = uploadRes.body.data.id;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/cv-import/${importId}`)
      .set(auth(stranger.accessToken));
    expect(res.status).toBe(404);
  });
});
