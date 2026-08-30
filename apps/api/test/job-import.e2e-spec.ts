import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JobFetcher } from '../src/job-import/job-fetcher';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';

jest.setTimeout(20000);

const GREENHOUSE_HTML = `
<html><head>
<meta property="og:image" content="https://acme.example.com/logo.png"/>
<script type="application/ld+json">
{
  "@type": "JobPosting",
  "title": "Senior Backend Engineer",
  "hiringOrganization": { "name": "Acme Corp" },
  "jobLocation": { "address": { "addressLocality": "Maputo", "addressCountry": "MZ" } },
  "employmentType": "FULL_TIME",
  "description": "<p>Build our platform.</p><p>Responsibilities</p><p>Ship features</p><p>Requirements</p><p>5+ years TypeScript and PostgreSQL experience. Bachelor's degree required.</p>",
  "baseSalary": { "currency": "USD", "value": { "minValue": 80000, "maxValue": 120000, "unitText": "YEAR" } }
}
</script>
</head></html>
`;

const LOW_CONFIDENCE_HTML =
  '<html><body>A job page with no structured metadata at all.</body></html>';

/**
 * Covers the Phase 10.5 Job Import Engine end-to-end against the real
 * Postgres from docker-compose.yml. `JobFetcher` (the network I/O
 * boundary) is overridden with a fake that returns canned HTML per test
 * URL — the same "swap the external-I/O boundary, exercise the real
 * pipeline behind it" pattern ai-orchestration.e2e-spec.ts uses for
 * AIProvider. JobFetcher's SSRF-guard behavior itself is covered
 * separately and thoroughly in job-fetcher.spec.ts (12 unit tests) against
 * the real (unmocked) class.
 */
describe('Job Import Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `job-import-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';

  class FakeJobFetcher {
    async fetchHtml(url: string) {
      if (url.includes('low-confidence')) {
        return { html: LOW_CONFIDENCE_HTML, finalUrl: url };
      }
      return { html: GREENHOUSE_HTML, finalUrl: url };
    }
  }

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JobFetcher)
      .useValue(new FakeJobFetcher())
      .compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `job-import-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        const jobTargets = await prisma.jobTarget.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const jobTargetIds = jobTargets.map((jt) => jt.id);

        if (jobTargetIds.length > 0) {
          await prisma.$transaction([
            prisma.jobImportMetadata.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
            prisma.jobTargetSkill.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
            prisma.jobTargetLanguage.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
          ]);
        }
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

  it('imports a job from a Greenhouse URL and auto-creates a READY JobTarget with skills/technologies/languages and a logo', async () => {
    const { accessToken, userId } = await registerAndLogin('greenhouse-import');

    const res = await request(app.getHttpServer())
      .post('/api/v1/job-import')
      .set(auth(accessToken))
      .send({ url: `https://boards.greenhouse.io/acme-corp/jobs/${testRunId}-123` });

    expect(res.status).toBe(201);
    expect(res.body.data.jobTarget.title).toBe('Senior Backend Engineer');
    expect(res.body.data.jobTarget.company).toBe('Acme Corp');
    expect(res.body.data.jobTarget.employmentType).toBe('Full Time');
    expect(res.body.data.jobTarget.seniority).toBe('Senior');
    expect(res.body.data.jobTarget.status).toBe('READY');
    expect(res.body.data.overallConfidence).toBeGreaterThan(0.5);
    expect(res.body.data.reusedExisting).toBe(false);

    const dbJobTarget = await prisma.jobTarget.findFirst({
      where: { userId },
      include: { skills: true },
    });
    expect(dbJobTarget?.source).toBe('greenhouse');
    expect(dbJobTarget?.salaryMin?.toNumber()).toBe(80000);
    // Combined skills+technologies land in the one JobTargetSkill collection (rules 2 & 3).
    expect(dbJobTarget?.skills.some((s) => s.skill === 'TypeScript')).toBe(true);
    expect(dbJobTarget?.skills.some((s) => s.skill === 'PostgreSQL')).toBe(true);

    const metadata = await prisma.jobImportMetadata.findUnique({
      where: { jobTargetId: dbJobTarget!.id },
    });
    expect(metadata?.provider).toBe('greenhouse');
    expect(metadata?.rawHtml).toContain('Senior Backend Engineer');
    expect(metadata?.companyLogoUrl).toBe('https://acme.example.com/logo.png');
    expect(metadata?.duplicateOfId).toBeNull();

    const extractedData = metadata?.extractedData as Record<string, unknown>;
    // skills/technologies stay disjoint arrays in the audit record even
    // though they're merged into one JobTargetSkill collection above.
    expect(extractedData.skills).toEqual(expect.arrayContaining(['TypeScript']));
    expect(extractedData.technologies).toEqual(expect.arrayContaining(['PostgreSQL']));
    expect(extractedData.salaryPeriod).toBe('YEARLY');
    expect(extractedData.experienceMinYears).toBe(5);
    expect(extractedData.educationLevel).toBe('Bachelor');
  });

  it('reuses a prior extraction when the exact same URL is imported again (rule 13)', async () => {
    const first = await registerAndLogin('dedup-first');
    const second = await registerAndLogin('dedup-second');
    const url = `https://boards.greenhouse.io/acme-corp/jobs/${testRunId}-dedup-1`;

    const firstRes = await request(app.getHttpServer())
      .post('/api/v1/job-import')
      .set(auth(first.accessToken))
      .send({ url });
    expect(firstRes.status).toBe(201);
    expect(firstRes.body.data.reusedExisting).toBe(false);

    const secondRes = await request(app.getHttpServer())
      .post('/api/v1/job-import')
      .set(auth(second.accessToken))
      .send({ url });
    expect(secondRes.status).toBe(201);
    expect(secondRes.body.data.reusedExisting).toBe(true);
    expect(secondRes.body.data.jobTarget.title).toBe('Senior Backend Engineer');

    // A distinct JobTarget was still created for the second user, not a shared row.
    expect(secondRes.body.data.jobTarget.id).not.toBe(firstRes.body.data.jobTarget.id);

    const secondMetadata = await prisma.jobImportMetadata.findUnique({
      where: { jobTargetId: secondRes.body.data.jobTarget.id },
    });
    const firstMetadata = await prisma.jobImportMetadata.findUnique({
      where: { jobTargetId: firstRes.body.data.jobTarget.id },
    });
    expect(secondMetadata?.duplicateOfId).toBe(firstMetadata?.id);
    // The original extraction timestamp is preserved, not reset to "now".
    expect(secondMetadata?.extractedAt.getTime()).toBe(firstMetadata?.extractedAt.getTime());
  });

  it('marks the JobTarget REQUIRES_REVIEW when extraction confidence is low', async () => {
    const { accessToken } = await registerAndLogin('low-confidence-import');

    const res = await request(app.getHttpServer())
      .post('/api/v1/job-import')
      .set(auth(accessToken))
      .send({ url: `https://example.com/low-confidence-job-${testRunId}` });

    expect(res.status).toBe(201);
    expect(res.body.data.jobTarget.status).toBe('REQUIRES_REVIEW');
    expect(res.body.data.overallConfidence).toBeLessThan(0.6);
  });

  it('rejects a malformed URL with 400', async () => {
    const { accessToken } = await registerAndLogin('bad-url');

    const res = await request(app.getHttpServer())
      .post('/api/v1/job-import')
      .set(auth(accessToken))
      .send({ url: 'not-a-url' });

    expect(res.status).toBe(400);
  });

  it('returns the import metadata for an owned JobTarget, and 404s for a non-owner', async () => {
    const owner = await registerAndLogin('metadata-owner');
    const stranger = await registerAndLogin('metadata-stranger');

    // Run-unique URL: rule 13's dedup reuse means a fixed literal URL here
    // would silently pick up whatever another test run already imported.
    const importRes = await request(app.getHttpServer())
      .post('/api/v1/job-import')
      .set(auth(owner.accessToken))
      .send({ url: `https://boards.greenhouse.io/acme-corp/jobs/metadata-${testRunId}` });
    const jobTargetId = importRes.body.data.jobTarget.id;

    const ownerRes = await request(app.getHttpServer())
      .get(`/api/v1/job-import/${jobTargetId}/metadata`)
      .set(auth(owner.accessToken));
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.provider).toBe('greenhouse');

    const strangerRes = await request(app.getHttpServer())
      .get(`/api/v1/job-import/${jobTargetId}/metadata`)
      .set(auth(stranger.accessToken));
    expect(strangerRes.status).toBe(404);
  });
});
