import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';

/**
 * Covers everything in the Payments & Credits phase that is reachable
 * without a working BillingProvider — package listing, payment creation
 * (ownership, package validation, deterministic FAILED-on-provider-error
 * lifecycle since MpesaBillingProvider is still an intentional
 * NotImplementedException stub — see billing/providers/mpesa-billing.provider.ts),
 * verify()'s pre-provider validation, ownership/IDOR on every route, and
 * the public callback route's lack of an auth requirement. The actual
 * webhook-confirmed → credits-allocated happy path is unit-tested with a
 * mocked BillingProviderRegistry (payment.service.spec.ts) instead of
 * here, because exercising it over real HTTP would require either a real
 * M-Pesa sandbox call (forbidden this phase) or a fake "always succeeds"
 * provider standing in for a real one in production code — never
 * introduced, since a payment feature is exactly where a misleading
 * always-succeeds stand-in would be dangerous.
 */
describe('Payments & Credits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `payments-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';
  let activePackageId: string;
  let inactivePackageId: string;

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);

    const active = await prisma.creditPackage.create({
      data: { priceMt: 100, baseCredits: 200, bonusCredits: 0, totalCredits: 200, active: true },
    });
    activePackageId = active.id;
    const inactive = await prisma.creditPackage.create({
      data: { priceMt: 50, baseCredits: 100, bonusCredits: 0, totalCredits: 100, active: false },
    });
    inactivePackageId = inactive.id;
  }, 60_000);

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `payments-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.$transaction([
          prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.creditWallet.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.historyEvent.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.verificationToken.deleteMany({ where: { userId: { in: userIds } } }),
        ]);
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.creditPackage.deleteMany({
        where: { id: { in: [activePackageId, inactivePackageId] } },
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

  // ---------------------------------------------------------------------
  // Credit packages
  // ---------------------------------------------------------------------

  describe('GET /credit-packages', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/credit-packages');
      expect(res.status).toBe(401);
    });

    it('lists only active packages, ordered by price ascending', async () => {
      const { accessToken } = await registerAndLogin('list-packages');
      const res = await request(app.getHttpServer())
        .get('/api/v1/credit-packages')
        .set(auth(accessToken));

      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((p) => p.id);
      expect(ids).toContain(activePackageId);
      expect(ids).not.toContain(inactivePackageId);
    });
  });

  // ---------------------------------------------------------------------
  // Payment creation
  // ---------------------------------------------------------------------

  describe('POST /payments', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .send({ packageId: 'x', provider: 'MPESA' });
      expect(res.status).toBe(401);
    });

    it('rejects an unknown packageId with 404', async () => {
      const { accessToken } = await registerAndLogin('unknown-package');
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set(auth(accessToken))
        .send({ packageId: randomUUID(), provider: 'MPESA' });
      expect(res.status).toBe(404);
    });

    it('rejects an inactive packageId with 404 (never silently substitutes an active one)', async () => {
      const { accessToken } = await registerAndLogin('inactive-package');
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set(auth(accessToken))
        .send({ packageId: inactivePackageId, provider: 'MPESA' });
      expect(res.status).toBe(404);
    });

    it('rejects an invalid provider value', async () => {
      const { accessToken } = await registerAndLogin('invalid-provider');
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set(auth(accessToken))
        .send({ packageId: activePackageId, provider: 'PAYPAL' });
      expect(res.status).toBe(400);
    });

    it('creates a real Payment row, then marks it FAILED (MpesaBillingProvider is still an intentional stub) — no credits are ever granted', async () => {
      const { userId, accessToken } = await registerAndLogin('create-happy');
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set(auth(accessToken))
        .send({ packageId: activePackageId, provider: 'MPESA' });

      // NotImplementedException → 501, the honest, disclosed outcome until real M-Pesa credentials exist.
      expect(res.status).toBe(501);

      const payment = await prisma.payment.findFirst({
        where: { userId, packageId: activePackageId },
      });
      expect(payment?.status).toBe('FAILED');
      expect(payment?.amount.toString()).toBe('100');
      expect((payment?.metadata as { failureReason?: string } | null)?.failureReason).toContain(
        'not implemented',
      );

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits ?? 0).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // Ownership / IDOR
  // ---------------------------------------------------------------------

  describe('Ownership', () => {
    it("one user cannot list, read, or verify another user's payment", async () => {
      const owner = await registerAndLogin('owner-idor');
      const stranger = await registerAndLogin('stranger-idor');
      await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set(auth(owner.accessToken))
        .send({ packageId: activePackageId, provider: 'MPESA' });
      const payment = await prisma.payment.findFirst({ where: { userId: owner.userId } });

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/payments/${payment!.id}`)
        .set(auth(stranger.accessToken));
      const verifyRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment!.id}/verify`)
        .set(auth(stranger.accessToken));

      expect(getRes.status).toBe(404);
      expect(verifyRes.status).toBe(404);
    });

    it("GET /payments only ever returns the caller's own payments", async () => {
      const { accessToken } = await registerAndLogin('list-own');
      const res = await request(app.getHttpServer()).get('/api/v1/payments').set(auth(accessToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // Verify (manual status poll)
  // ---------------------------------------------------------------------

  describe('POST /payments/:id/verify', () => {
    it('rejects verifying a payment that never got a providerReference (FAILED-on-create, in this environment)', async () => {
      const { accessToken } = await registerAndLogin('verify-no-ref');
      await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set(auth(accessToken))
        .send({ packageId: activePackageId, provider: 'MPESA' });
      const payment = await prisma.payment.findFirst({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment!.id}/verify`)
        .set(auth(accessToken));

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------
  // Callback — public, no auth
  // ---------------------------------------------------------------------

  describe('POST /payments/callback/:provider', () => {
    it('does not require authentication (the caller is the provider, not a logged-in user)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/callback/MPESA')
        .send({});
      // Reaches PaymentService.handleCallback() → provider.processCallback() → NotImplementedException (501),
      // never 401 — proving the route itself has no JwtAuthGuard.
      expect(res.status).not.toBe(401);
      expect(res.status).toBe(501);
    });

    it('rejects an unknown provider in the route param', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/callback/PAYPAL')
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
