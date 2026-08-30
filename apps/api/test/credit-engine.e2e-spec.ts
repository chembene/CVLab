import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreditService } from '../src/credits/credit.service';
import { InsufficientCreditsException } from '../src/credits/errors/insufficient-credits.exception';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';
import { waitForHistoryEventTypes } from './utils/wait-for-history-events';

/**
 * Covers the Phase 5 Credit Engine & Billing Foundation end-to-end against
 * the real Postgres/Redis from docker-compose.yml. `GET /credits`,
 * `GET /credits/transactions`, `POST /credits/estimate`, and
 * `POST /admin/credits/adjust` are exercised over real HTTP. `spend()` /
 * `spendAndExecute()` / concurrency / idempotency are exercised by calling
 * `CreditService` directly through the app's real DI container against the
 * real database — there is deliberately no public "spend credits" HTTP
 * endpoint yet (nothing legitimate would call one before an actual paid
 * feature exists — see docs/architecture/credit-architecture.md), but the
 * service itself is fully wired, transactional, and real-DB-tested here.
 */
describe('Credit Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `credit-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    creditService = moduleRef.get(CreditService);
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `credit-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        await prisma.$transaction([
          prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.creditWallet.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } }),
          prisma.historyEvent.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.verificationToken.deleteMany({ where: { userId: { in: userIds } } }),
        ]);
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.featurePricing.deleteMany({
        where: { featureKey: { startsWith: `credit-e2e-${testRunId}` } },
      });
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
    // Role is embedded in the JWT at login time — log in again after the promotion so the token carries ADMIN.
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailFor(label), password: PASSWORD });
    return { userId: account.userId, accessToken: loginRes.body.data.accessToken };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  /** Test-fixture helper — grants credits via the real service (not raw SQL), using the target user itself as the audit-log actor (audit_logs.actor_id has a real FK to users, so a synthetic non-user actor id would violate it). */
  async function grantCredits(userId: string, amount: number, label: string): Promise<void> {
    await creditService.adjustBalance(userId, {
      userId,
      amount,
      type: 'ADMIN_ADJUSTMENT',
      reason: 'Test fixture setup',
      idempotencyKey: `${label}-grant-${randomUUID()}`,
    });
  }

  // ---------------------------------------------------------------------
  // Wallet + history endpoints
  // ---------------------------------------------------------------------

  describe('GET /credits', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/credits');
      expect(res.status).toBe(401);
    });

    it('lazily creates a zero-balance wallet on first access', async () => {
      const { accessToken } = await registerAndLogin('wallet');
      const res = await request(app.getHttpServer()).get('/api/v1/credits').set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.availableCredits).toBe(0);
      expect(res.body.data.lifetimePurchased).toBe(0);
      expect(res.body.data.lifetimeConsumed).toBe(0);
    });
  });

  describe('GET /credits/transactions', () => {
    it('requires authentication and paginates', async () => {
      const unauth = await request(app.getHttpServer()).get('/api/v1/credits/transactions');
      expect(unauth.status).toBe(401);

      const { userId, accessToken } = await registerAndLogin('history-list');
      await grantCredits(userId, 100, 'history-list');

      const res = await request(app.getHttpServer())
        .get('/api/v1/credits/transactions?page=1&limit=10')
        .set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });
    });
  });

  describe('POST /credits/estimate', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/credits/estimate')
        .send({ featureKey: 'x' });
      expect(res.status).toBe(401);
    });

    it('404s for an unknown feature', async () => {
      const { accessToken } = await registerAndLogin('estimate-unknown');
      const res = await request(app.getHttpServer())
        .post('/api/v1/credits/estimate')
        .set(auth(accessToken))
        .send({ featureKey: 'does_not_exist' });
      expect(res.status).toBe(404);
    });

    it('reports cost/balance/sufficiency for a known active feature', async () => {
      const featureKey = `credit-e2e-${testRunId}-cv-improvement`;
      await prisma.featurePricing.create({ data: { featureKey, cost: 30, active: true } });
      const { userId, accessToken } = await registerAndLogin('estimate-known');
      await grantCredits(userId, 100, 'estimate-known');

      const res = await request(app.getHttpServer())
        .post('/api/v1/credits/estimate')
        .set(auth(accessToken))
        .send({ featureKey });

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        featureKey,
        cost: 30,
        currentBalance: 100,
        sufficientBalance: true,
        balanceAfter: 70,
      });
    });
  });

  // ---------------------------------------------------------------------
  // Admin adjustment
  // ---------------------------------------------------------------------

  describe('POST /admin/credits/adjust', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/admin/credits/adjust').send({});
      expect(res.status).toBe(401);
    });

    it('rejects a regular USER (RBAC)', async () => {
      const { accessToken } = await registerAndLogin('admin-forbidden');
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/credits/adjust')
        .set(auth(accessToken))
        .send({
          userId: 'someone',
          amount: 10,
          type: 'ADMIN_ADJUSTMENT',
          reason: 'x',
          idempotencyKey: 'k',
        });
      expect(res.status).toBe(403);
    });

    it('grants credits, is idempotent, and writes an audit log', async () => {
      const admin = await registerAdmin('admin-actor');
      const target = await registerAndLogin('admin-target');
      const idempotencyKey = `admin-adjust-${randomUUID()}`;

      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/admin/credits/adjust')
        .set(auth(admin.accessToken))
        .send({
          userId: target.userId,
          amount: 200,
          type: 'ADMIN_ADJUSTMENT',
          reason: 'Goodwill credit',
          idempotencyKey,
        });
      expect(firstRes.status).toBe(201);

      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/admin/credits/adjust')
        .set(auth(admin.accessToken))
        .send({
          userId: target.userId,
          amount: 200,
          type: 'ADMIN_ADJUSTMENT',
          reason: 'Goodwill credit',
          idempotencyKey,
        });
      expect(secondRes.status).toBe(201);
      expect(secondRes.body.data.id).toBe(firstRes.body.data.id);

      const walletRes = await request(app.getHttpServer())
        .get('/api/v1/credits')
        .set(auth(target.accessToken));
      expect(walletRes.body.data.availableCredits).toBe(200); // not 400 — the duplicate request never re-applied

      const auditRows = await prisma.auditLog.findMany({
        where: { actorId: admin.userId, targetId: target.userId },
      });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]?.action).toBe('credits.adjust');
    });

    it('rejects a negative adjustment that would drive the balance below zero', async () => {
      const admin = await registerAdmin('admin-actor-2');
      const target = await registerAndLogin('admin-target-negative');
      await grantCredits(target.userId, 10, 'admin-target-negative');

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/credits/adjust')
        .set(auth(admin.accessToken))
        .send({
          userId: target.userId,
          amount: -50,
          type: 'ADMIN_ADJUSTMENT',
          reason: 'x',
          idempotencyKey: randomUUID(),
        });

      expect(res.status).toBe(409);

      const walletRes = await request(app.getHttpServer())
        .get('/api/v1/credits')
        .set(auth(target.accessToken));
      expect(walletRes.body.data.availableCredits).toBe(10); // unchanged — no partial write
    });
  });

  // ---------------------------------------------------------------------
  // Spend / negative-balance protection / rollback
  // ---------------------------------------------------------------------

  describe('CreditService.spend', () => {
    it('throws InsufficientCreditsException and leaves the balance untouched when overdrawing', async () => {
      const { userId } = await registerAndLogin('spend-insufficient');

      await expect(
        creditService.spend(userId, { amount: 10, idempotencyKey: randomUUID() }),
      ).rejects.toBeInstanceOf(InsufficientCreditsException);

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(0);
      const transactions = await prisma.creditTransaction.findMany({ where: { userId } });
      expect(transactions).toHaveLength(0); // no partial ledger write on failure
    });

    it('is idempotent under real concurrency — the same key fired in parallel only consumes once', async () => {
      const { userId } = await registerAndLogin('spend-idempotent');
      await grantCredits(userId, 100, 'spend-idempotent');
      const idempotencyKey = `idempotent-${randomUUID()}`;

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          creditService.spend(userId, { amount: 30, idempotencyKey }),
        ),
      );

      const distinctIds = new Set(results.map((r) => r.id));
      expect(distinctIds.size).toBe(1);

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(70); // decremented exactly once, not 5 times
    });

    it('is concurrency-safe — parallel spends racing against a limited balance never overdraw', async () => {
      const { userId } = await registerAndLogin('spend-concurrent');
      await grantCredits(userId, 100, 'spend-concurrent');

      const attempts = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          creditService.spend(userId, { amount: 30, idempotencyKey: randomUUID() }),
        ),
      );

      const succeeded = attempts.filter((a) => a.status === 'fulfilled');
      const failed = attempts.filter((a) => a.status === 'rejected');
      // floor(100 / 30) = 3 can succeed; the other 2 must fail with InsufficientCredits.
      expect(succeeded).toHaveLength(3);
      expect(failed).toHaveLength(2);
      for (const failure of failed as PromiseRejectedResult[]) {
        expect(failure.reason).toBeInstanceOf(InsufficientCreditsException);
      }

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(10); // 100 - 3*30 = 10, never negative
    });
  });

  describe('CreditService.spendAndExecute (automatic refund)', () => {
    it('does not refund when the guarded work succeeds', async () => {
      const { userId } = await registerAndLogin('auto-refund-success');
      await grantCredits(userId, 100, 'auto-refund-success');

      const result = await creditService.spendAndExecute(
        userId,
        { amount: 30, reference: 'test_feature', idempotencyKey: randomUUID() },
        async () => 'ok',
      );

      expect(result).toBe('ok');
      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(70);
      // Filters out the ADMIN_ADJUSTMENT row from grantCredits()'s own setup — only asserting on what spendAndExecute itself wrote.
      const transactions = await prisma.creditTransaction.findMany({
        where: { userId, type: { in: ['CONSUMPTION', 'REFUND'] } },
      });
      expect(transactions.map((t) => t.type)).toEqual(['CONSUMPTION']);
    });

    it('automatically refunds and restores the exact original balance when the guarded work fails', async () => {
      const { userId } = await registerAndLogin('auto-refund-failure');
      await grantCredits(userId, 100, 'auto-refund-failure');

      await expect(
        creditService.spendAndExecute(
          userId,
          { amount: 30, reference: 'test_feature', idempotencyKey: randomUUID() },
          async () => {
            throw new Error('provider unavailable');
          },
        ),
      ).rejects.toThrow('provider unavailable');

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(100); // fully restored

      const transactions = await prisma.creditTransaction.findMany({
        where: { userId, type: { in: ['CONSUMPTION', 'REFUND'] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(transactions.map((t) => t.type)).toEqual(['CONSUMPTION', 'REFUND']);
    });
  });

  // ---------------------------------------------------------------------
  // History events
  // ---------------------------------------------------------------------

  describe('History events', () => {
    it('records credits_consumed, credits_refunded, and credits_adjusted', async () => {
      const { userId } = await registerAndLogin('history-events');
      await grantCredits(userId, 100, 'history-events');

      await creditService.spend(userId, { amount: 30, idempotencyKey: randomUUID() });
      await creditService
        .spendAndExecute(userId, { amount: 20, idempotencyKey: randomUUID() }, async () => {
          throw new Error('fail on purpose');
        })
        .catch(() => undefined);

      const eventTypes = await waitForHistoryEventTypes(prisma, userId, [
        'credits_adjusted',
        'credits_consumed',
        'credits_refunded',
      ]);

      expect(eventTypes).toContain('credits_adjusted');
      expect(eventTypes).toContain('credits_consumed');
      expect(eventTypes).toContain('credits_refunded');
    });
  });
});
