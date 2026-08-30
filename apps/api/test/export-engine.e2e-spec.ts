import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreditService } from '../src/credits/credit.service';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';

const execFileAsync = promisify(execFile);

/**
 * Covers the Export Engine end-to-end against the real Postgres/Redis from
 * docker-compose.yml AND a real headless Chromium (via PdfResumeRenderer's
 * own PDF_CHROMIUM_PATH/dev-fallback resolution — see
 * docs/architecture/export-engine.md §"PDF Rendering"). Deliberately does
 * NOT mock PdfResumeRenderer/DocxResumeRenderer/CreditService, mirroring
 * every other e2e suite's "no service mocks in e2e" convention — this is
 * the one layer that actually proves headless-Chromium PDF generation and
 * the `docx` OOXML serializer both work against a real browser/filesystem,
 * not just against jest.fn() stand-ins (see the renderer unit specs for
 * that isolated coverage).
 */
describe('Export Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `export-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';
  const PDF_KEY = 'export_resume_pdf';
  const DOCX_KEY = 'export_resume_docx';
  // Distinctive per-run marker embedded in every test fixture's summary, so
  // extracted PDF/DOCX text can be matched precisely and never collides
  // with another parallel test run against the same shared dev database.
  const marker = (label: string) => `ExportMarker-${testRunId}-${label}`;

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    creditService = moduleRef.get(CreditService);

    await prisma.featurePricing.createMany({
      data: [
        { featureKey: PDF_KEY, cost: 10, active: true },
        { featureKey: DOCX_KEY, cost: 5, active: true },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `export-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        const variants = await prisma.resumeVariant.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const variantIds = variants.map((v) => v.id);

        // FK order: exported_documents (RESTRICT on user/variant, SET NULL
        // on version) -> resumeVariantVersion rows -> resumeVariant rows ->
        // everything else. None of these relations cascade on delete.
        await prisma.exportedDocument.deleteMany({ where: { userId: { in: userIds } } });
        if (variantIds.length > 0) {
          await prisma.resumeVariantVersion.deleteMany({
            where: { resumeVariantId: { in: variantIds } },
          });
        }
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

        await prisma.$transaction([
          prisma.masterResume.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.profile.deleteMany({ where: { userId: { in: userIds } } }),
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
        where: { featureKey: { in: [PDF_KEY, DOCX_KEY] } },
      });
      await prisma.resumeTemplate.deleteMany({
        where: { id: { contains: `export-e2e-archived-${testRunId}` } },
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

  /**
   * superagent only auto-buffers a handful of well-known binary
   * content-types into `res.body` as a Buffer (application/pdf among
   * them) — the DOCX OOXML mimetype isn't in that list, so without this
   * explicit parser `res.body` comes back as a malformed object instead
   * of the raw bytes. Applied to every export request for consistency.
   */
  function binaryParser(
    res: request.Response,
    callback: (err: Error | null, body?: Buffer) => void,
  ) {
    res.setEncoding('binary');
    let data = '';
    res.on('data', (chunk: string) => {
      data += chunk;
    });
    res.on('end', () => callback(null, Buffer.from(data, 'binary')));
  }

  function postExport(accessToken: string) {
    return request(app.getHttpServer())
      .post('/api/v1/exports/resume')
      .set(auth(accessToken))
      .buffer(true)
      .parse(binaryParser);
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

  async function walletBalance(userId: string): Promise<number> {
    const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
    return wallet?.availableCredits ?? 0;
  }

  /** Master Resume + one Resume Variant whose content.summary is a unique, greppable marker. */
  async function createVariantWithSummary(accessToken: string, summary: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/api/v1/resume')
      .set(auth(accessToken))
      .send({ title: 'My Resume', summary });
    const variantRes = await request(app.getHttpServer())
      .post('/api/v1/resume-variants')
      .set(auth(accessToken))
      .send({ title: 'Export Test Variant' });
    return variantRes.body.data.id as string;
  }

  async function getVersionId(
    accessToken: string,
    variantId: string,
    versionNumber: number,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/resume-variants/${variantId}/versions/${versionNumber}`)
      .set(auth(accessToken));
    return res.body.data.id as string;
  }

  /**
   * Extracts the plain-text content of a PDF buffer via pdfjs-dist — same
   * library CvParser already uses in production, but run in a short-lived
   * child `node` process rather than via Jest's own `importEsm()`/
   * `--experimental-vm-modules` machinery. pdfjs-dist's legacy build is
   * ESM-only, and dynamically `import()`-ing it from deep inside a long
   * `--runInBand` run hits Node's process-global ESM module cache: if an
   * earlier test file (e.g. cv-import.e2e-spec.ts, which also dynamically
   * imports pdfjs-dist) already loaded it and then had ITS OWN Jest
   * environment torn down, this file's later `import()` of the "same"
   * specifier can resolve against that now-dead environment and throw
   * "Test environment has been torn down" — reproduced directly against
   * this suite. A plain child process shares none of that state. See
   * test/utils/extract-pdf-text.mjs.
   */
  async function extractPdfText(buffer: Buffer): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'export-e2e-pdf-'));
    const pdfPath = join(dir, 'resume.pdf');
    try {
      await writeFile(pdfPath, buffer);
      const scriptPath = join(__dirname, 'utils', 'extract-pdf-text.mjs');
      const { stdout } = await execFileAsync('node', [scriptPath, pdfPath], { timeout: 20_000 });
      return stdout;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Extracts the plain-text content of a DOCX buffer — unzips the OOXML container and strips tags from word/document.xml. */
  async function extractDocxText(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')!.async('string');
    return xml.replace(/<[^>]+>/g, ' ');
  }

  // ---------------------------------------------------------------------
  // Authentication & validation
  // ---------------------------------------------------------------------

  describe('Authentication & validation', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/exports/resume')
        .send({ resumeVariantId: 'x', format: 'PDF' });
      expect(res.status).toBe(401);
    });

    it('rejects an invalid format', async () => {
      const { accessToken } = await registerAndLogin('bad-format');
      const variantId = await createVariantWithSummary(accessToken, marker('bad-format'));
      const res = await postExport(accessToken).send({ resumeVariantId: variantId, format: 'TXT' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for a non-existent Resume Variant', async () => {
      const { accessToken } = await registerAndLogin('missing-variant');
      const res = await postExport(accessToken).send({
        resumeVariantId: randomUUID(),
        format: 'PDF',
      });
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Ownership / IDOR
  // ---------------------------------------------------------------------

  describe('Ownership', () => {
    it("user A cannot export user B's Resume Variant (404, not 403 — existence is not leaked)", async () => {
      const owner = await registerAndLogin('owner-a');
      const stranger = await registerAndLogin('stranger-a');
      await grantCredits(stranger.userId, 100, 'stranger-a');
      const variantId = await createVariantWithSummary(owner.accessToken, marker('owner-a'));

      const res = await postExport(stranger.accessToken).send({
        resumeVariantId: variantId,
        format: 'PDF',
      });

      expect(res.status).toBe(404);
    });

    it('rejects a resumeVariantVersionId that belongs to a different Resume Variant', async () => {
      const { accessToken } = await registerAndLogin('cross-variant');
      await grantCredits(
        (await prisma.user.findFirstOrThrow({ where: { email: emailFor('cross-variant') } })).id,
        100,
        'cross-variant',
      );
      const variantAId = await createVariantWithSummary(accessToken, marker('cross-variant-a'));
      const variantBId = await createVariantWithSummary(accessToken, marker('cross-variant-b'));
      const versionOfB = await getVersionId(accessToken, variantBId, 1);

      const res = await postExport(accessToken).send({
        resumeVariantId: variantAId,
        resumeVariantVersionId: versionOfB,
        format: 'PDF',
      });

      expect(res.status).toBe(404);
    });

    it('rejects a non-existent resumeVariantVersionId', async () => {
      const { accessToken } = await registerAndLogin('missing-version');
      const variantId = await createVariantWithSummary(accessToken, marker('missing-version'));

      const res = await postExport(accessToken).send({
        resumeVariantId: variantId,
        resumeVariantVersionId: randomUUID(),
        format: 'PDF',
      });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // PDF — happy path, current vs. historical version, real content
  // ---------------------------------------------------------------------

  describe('POST /exports/resume — PDF', () => {
    it('exports the current content as a real, downloadable PDF, charges 10 credits, and marks the ExportedDocument SUCCESS', async () => {
      const { userId, accessToken } = await registerAndLogin('pdf-happy');
      await grantCredits(userId, 100, 'pdf-happy');
      const summary = marker('pdf-happy');
      const variantId = await createVariantWithSummary(accessToken, summary);

      const balanceBefore = await walletBalance(userId);
      const res = await postExport(accessToken).send({ resumeVariantId: variantId, format: 'PDF' });

      expect(res.status).toBe(201);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe('attachment; filename="curriculo.pdf"');
      const buffer = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');

      const text = await extractPdfText(buffer);
      expect(text).toContain(summary);

      const balanceAfter = await walletBalance(userId);
      expect(balanceBefore - balanceAfter).toBe(10);

      const record = await prisma.exportedDocument.findFirst({
        where: { userId, resumeVariantId: variantId, format: 'PDF' },
        orderBy: { createdAt: 'desc' },
      });
      expect(record?.status).toBe('SUCCESS');
      expect(record?.creditsCharged).toBe(10);
    }, 30_000);

    it('exports the current content (not a historical one) when resumeVariantVersionId is omitted, and a historical version when it is given', async () => {
      const { userId, accessToken } = await registerAndLogin('pdf-versions');
      await grantCredits(userId, 100, 'pdf-versions');
      const originalSummary = marker('pdf-versions-original');
      const updatedSummary = marker('pdf-versions-updated');
      const variantId = await createVariantWithSummary(accessToken, originalSummary);
      const originalVersionId = await getVersionId(accessToken, variantId, 1);

      await request(app.getHttpServer())
        .put(`/api/v1/resume-variants/${variantId}`)
        .set(auth(accessToken))
        .send({
          content: {
            title: 'My Resume',
            summary: updatedSummary,
            skills: [],
            workExperiences: [],
            educations: [],
            languages: [],
          },
        });

      const currentRes = await postExport(accessToken).send({
        resumeVariantId: variantId,
        format: 'PDF',
      });
      expect(currentRes.status).toBe(201);
      const currentText = await extractPdfText(
        Buffer.isBuffer(currentRes.body) ? currentRes.body : Buffer.from(currentRes.body),
      );
      expect(currentText).toContain(updatedSummary);
      expect(currentText).not.toContain(originalSummary);

      const historicalRes = await postExport(accessToken).send({
        resumeVariantId: variantId,
        resumeVariantVersionId: originalVersionId,
        format: 'PDF',
      });
      expect(historicalRes.status).toBe(201);
      const historicalText = await extractPdfText(
        Buffer.isBuffer(historicalRes.body) ? historicalRes.body : Buffer.from(historicalRes.body),
      );
      expect(historicalText).toContain(originalSummary);
      expect(historicalText).not.toContain(updatedSummary);
    }, 30_000);
  });

  // ---------------------------------------------------------------------
  // DOCX — happy path, real content
  // ---------------------------------------------------------------------

  describe('POST /exports/resume — DOCX', () => {
    it('exports a real, valid DOCX and charges 5 credits', async () => {
      const { userId, accessToken } = await registerAndLogin('docx-happy');
      await grantCredits(userId, 100, 'docx-happy');
      const summary = marker('docx-happy');
      const variantId = await createVariantWithSummary(accessToken, summary);

      const balanceBefore = await walletBalance(userId);
      const res = await postExport(accessToken).send({
        resumeVariantId: variantId,
        format: 'DOCX',
      });

      expect(res.status).toBe(201);
      expect(res.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(res.headers['content-disposition']).toBe('attachment; filename="curriculo.docx"');
      const buffer = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
      expect(buffer.subarray(0, 4).toString('hex')).toBe('504b0304');

      const text = await extractDocxText(buffer);
      expect(text).toContain(summary);

      const balanceAfter = await walletBalance(userId);
      expect(balanceBefore - balanceAfter).toBe(5);
    }, 30_000);
  });

  // ---------------------------------------------------------------------
  // Credits — insufficient balance, failure + refund, idempotency
  // ---------------------------------------------------------------------

  describe('Credits', () => {
    it('rejects export with 409 when the balance is insufficient, and marks the ExportedDocument FAILED without charging anything', async () => {
      const { userId, accessToken } = await registerAndLogin('insufficient');
      // No grantCredits() call — a freshly registered wallet starts at 0.
      const variantId = await createVariantWithSummary(accessToken, marker('insufficient'));

      const res = await postExport(accessToken).send({ resumeVariantId: variantId, format: 'PDF' });

      expect(res.status).toBe(409);
      expect(await walletBalance(userId)).toBe(0);

      const record = await prisma.exportedDocument.findFirst({
        where: { userId, resumeVariantId: variantId, format: 'PDF' },
        orderBy: { createdAt: 'desc' },
      });
      expect(record?.status).toBe('FAILED');
      expect(record?.creditsCharged).toBe(0);
      expect(record?.creditsRefunded).toBe(0);
    }, 30_000);

    it('refunds credits in full when rendering fails, and marks the ExportedDocument FAILED', async () => {
      const { userId, accessToken } = await registerAndLogin('render-failure');
      await grantCredits(userId, 100, 'render-failure');
      const variantId = await createVariantWithSummary(accessToken, marker('render-failure'));
      // Legitimate, non-mocked way to force PdfResumeRenderer.resolveTemplate()
      // to throw NotFoundException: ResumeVariant.templateId has a real FK
      // to resume_templates, so a bogus string is rejected by Postgres
      // itself — instead, insert a genuine template row but ARCHIVED.
      // ResumeTemplateRepository.findById() filters `status: 'ACTIVE'`, so
      // this is a real 404 from the real renderer's real lookup, not a
      // mocked failure.
      const archivedTemplateId = `export-e2e-archived-${testRunId}`;
      await prisma.resumeTemplate.create({
        data: {
          id: archivedTemplateId,
          name: 'Archived Test Template',
          category: 'ATS_CLASSIC',
          primaryColor: '#000000',
          secondaryColor: '#333333',
          font: 'Arial',
          layout: 'single-column',
          supportedSections: ['summary'],
          status: 'ARCHIVED',
        },
      });
      await prisma.resumeVariant.update({
        where: { id: variantId },
        data: { templateId: archivedTemplateId },
      });

      const balanceBefore = await walletBalance(userId);
      const res = await postExport(accessToken).send({ resumeVariantId: variantId, format: 'PDF' });

      expect(res.status).toBe(404);
      const balanceAfter = await walletBalance(userId);
      expect(balanceAfter).toBe(balanceBefore); // charged, then refunded — net zero

      const record = await prisma.exportedDocument.findFirst({
        where: { userId, resumeVariantId: variantId, format: 'PDF' },
        orderBy: { createdAt: 'desc' },
      });
      expect(record?.status).toBe('FAILED');
      expect(record?.creditsCharged).toBe(10);
      expect(record?.creditsRefunded).toBe(10);
    }, 30_000);

    it('does not double-charge when the exact same export is requested twice (deterministic idempotency key)', async () => {
      const { userId, accessToken } = await registerAndLogin('idempotent');
      await grantCredits(userId, 100, 'idempotent');
      const variantId = await createVariantWithSummary(accessToken, marker('idempotent'));

      const balanceBefore = await walletBalance(userId);
      const first = await postExport(accessToken).send({
        resumeVariantId: variantId,
        format: 'DOCX',
      });
      const second = await postExport(accessToken).send({
        resumeVariantId: variantId,
        format: 'DOCX',
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const balanceAfter = await walletBalance(userId);
      // Charged once (5 credits), not twice — the second, identical request
      // reuses CreditService.spend()'s own idempotency guard.
      expect(balanceBefore - balanceAfter).toBe(5);

      const records = await prisma.exportedDocument.findMany({
        where: { userId, resumeVariantId: variantId, format: 'DOCX' },
      });
      expect(records).toHaveLength(1);
      expect(records[0]?.status).toBe('SUCCESS');
    }, 30_000);
  });
});
