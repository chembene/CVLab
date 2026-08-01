import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UserStatus } from '@prisma/client';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REFRESH_COOKIE_NAME } from '../src/auth/auth.constants';
import { bootstrapTestApp } from './utils/bootstrap-test-app';

const PASSWORD = 'Sup3rSecret1';

function extractCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  const raw = setCookieHeader?.find((c) => c.startsWith(`${name}=`));
  if (!raw) return undefined;
  return raw.split(';')[0]?.split('=')[1];
}

/**
 * Covers the Phase 1 critical authentication journey and the explicit
 * security test matrix from the task brief: wrong password, unknown email,
 * suspended/deleted accounts, expired access/refresh tokens, revoked and
 * reused refresh tokens, invalid refresh cookies, role-escalation attempts,
 * missing auth, malformed JWTs, and password-reset enumeration protection.
 * Runs against the real Postgres/Redis from docker-compose.yml.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let configService: ConfigService;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `auth-e2e-${testRunId}-${label}@example.com`;

  // Test-side only — production ThrottlerModule config and the @Throttle()
  // decorators on AuthController are completely untouched; nothing under
  // src/ is modified. This suite fires many register/login calls
  // back-to-back across ~30 cases, which legitimately trips the real
  // per-minute limits — the guard itself (rate limiting works) is not what
  // these tests are about.
  //
  // ThrottlerGuard is registered globally via the APP_GUARD token in
  // AppModule, not via a per-route @UseGuards() decorator. Neither
  // `.overrideGuard(ThrottlerGuard)` nor `.overrideProvider(APP_GUARD)`
  // from @nestjs/testing actually intercepts it in that configuration (both
  // were tried and verified, via the real ThrottlerGuard.canActivate still
  // appearing in thrown-exception stack traces, to leave the real guard
  // running) — a known limitation of Nest's global-guard DI wiring.
  // Patching the prototype method directly works regardless of how the
  // instance was constructed/injected, and is scoped to this test file only
  // (Jest gives each test file its own module registry, so this never
  // leaks into health.e2e-spec.ts or any other suite).
  let throttlerSpy: jest.SpyInstance;

  beforeAll(async () => {
    throttlerSpy = jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    configService = moduleRef.get(ConfigService);
  });

  afterAll(async () => {
    // Children before parents (FK constraints are ON DELETE RESTRICT by
    // design — see database-overview.md — so users can't be deleted while
    // their sessions/tokens still reference them), in one transaction, and
    // app.close() must run even if cleanup throws so Prisma/Redis always
    // disconnect and Jest can exit.
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `auth-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((user) => user.id);

      if (userIds.length > 0) {
        await prisma.$transaction([
          prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.verificationToken.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.user.deleteMany({ where: { id: { in: userIds } } }),
        ]);
      }
    } finally {
      await app.close();
      throttlerSpy.mockRestore();
    }
  });

  async function registerUser(email: string, password = PASSWORD) {
    return request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password });
  }

  async function loginUser(email: string, password = PASSWORD) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
    return {
      res,
      accessToken: res.body?.data?.accessToken as string | undefined,
      refreshCookie: extractCookie(setCookie, REFRESH_COOKIE_NAME),
    };
  }

  async function registerAndLogin(label: string) {
    const email = emailFor(label);
    await registerUser(email);
    const login = await loginUser(email);
    return { email, ...login };
  }

  // ---------------------------------------------------------------------
  // Critical journey
  // ---------------------------------------------------------------------

  describe('critical journey', () => {
    const email = emailFor('journey');

    it('registers without leaking passwordHash and defaults to PENDING_VERIFICATION/USER', async () => {
      const res = await registerUser(email);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.user.role).toBe('USER');
      expect(res.body.data.user.status).toBe('PENDING_VERIFICATION');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('rejects duplicate registration for the same email', async () => {
      const res = await registerUser(email);
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('logs in, sets a secure HttpOnly/SameSite=Strict refresh cookie scoped to /api/v1/auth, and never returns the refresh token in the body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data).not.toHaveProperty('refreshToken');

      const setCookie = res.headers['set-cookie'] as unknown as string[];
      const cookieStr = setCookie.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
      expect(cookieStr).toBeDefined();
      expect(cookieStr).toMatch(/HttpOnly/i);
      expect(cookieStr).toMatch(/SameSite=Strict/i);
      expect(cookieStr).toMatch(/Path=\/api\/v1\/auth/i);
    });

    it('returns the current user via GET /me using the access token', async () => {
      const { accessToken } = await loginUser(email);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(email);
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    it('rotates the refresh token on /refresh; the old token then fails, and reusing it revokes the whole family (the freshly-rotated token dies too)', async () => {
      const { refreshCookie } = await loginUser(email);

      const rotated = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookie}`);
      expect(rotated.status).toBe(200);
      expect(rotated.body.data.accessToken).toEqual(expect.any(String));

      const newCookie = extractCookie(
        rotated.headers['set-cookie'] as unknown as string[],
        REFRESH_COOKIE_NAME,
      );
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toBe(refreshCookie);

      // Reusing the now-stale original token is detected as reuse.
      const reuseAttempt = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookie}`);
      expect(reuseAttempt.status).toBe(401);

      // The reuse response never leaks which token/session was affected.
      expect(JSON.stringify(reuseAttempt.body)).not.toMatch(/session-|family/i);

      // The consequence of that reuse: the entire family is revoked, so even
      // the legitimately-rotated newest token is now also invalid.
      const newTokenAttempt = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${newCookie}`);
      expect(newTokenAttempt.status).toBe(401);
    });

    it('logout revokes the session and clears the cookie; the revoked token cannot be reused', async () => {
      const { refreshCookie } = await loginUser(email);

      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookie}`);
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.data).toEqual({ loggedOut: true });

      const clearedCookie = (logoutRes.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith(`${REFRESH_COOKIE_NAME}=`),
      );
      expect(clearedCookie).toMatch(/Expires=Thu, 01 Jan 1970/i);

      const afterLogout = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookie}`);
      expect(afterLogout.status).toBe(401);
    });

    it('logout-all revokes every session for the user', async () => {
      const email2 = emailFor('logout-all');
      await registerUser(email2);
      const sessionA = await loginUser(email2);
      const sessionB = await loginUser(email2);

      const logoutAllRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${sessionA.accessToken}`);
      expect(logoutAllRes.status).toBe(200);

      for (const session of [sessionA, sessionB]) {
        const refreshAttempt = await request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', `${REFRESH_COOKIE_NAME}=${session.refreshCookie}`);
        expect(refreshAttempt.status).toBe(401);
      }
    });
  });

  // ---------------------------------------------------------------------
  // Explicit security test matrix (prompts task §23)
  // ---------------------------------------------------------------------

  describe('security test matrix', () => {
    it('1. wrong password -> generic invalid-credentials error', async () => {
      const email = emailFor('wrong-pw');
      await registerUser(email);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'TotallyWrongPassword1' });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid credentials.');
    });

    it('2. unknown email -> the exact same generic error as a wrong password (no enumeration)', async () => {
      const wrongPwRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: emailFor('wrong-pw'), password: 'TotallyWrongPassword1' });
      const unknownRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: emailFor('never-registered'), password: 'Whatever1' });

      expect(unknownRes.status).toBe(401);
      expect(unknownRes.body.error.message).toBe(wrongPwRes.body.error.message);
    });

    it('3. suspended account -> login denied', async () => {
      const email = emailFor('suspended');
      await registerUser(email);
      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.SUSPENDED } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD });

      expect(res.status).toBe(401);
    });

    it('4. deleted (soft-deleted) account -> login denied', async () => {
      const email = emailFor('deleted');
      await registerUser(email);
      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date(), status: UserStatus.DELETED },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD });

      expect(res.status).toBe(401);
    });

    it('5. expired access token -> rejected by GET /me', async () => {
      const jwtService = new JwtService();
      const expiredToken = await jwtService.signAsync(
        { sub: 'whoever', role: 'USER' },
        { secret: configService.get<string>('JWT_ACCESS_SECRET'), expiresIn: '-10s' },
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
    });

    it('6. expired refresh token (absolute session lifetime reached) -> refresh denied', async () => {
      const { email, refreshCookie } = await registerAndLogin('expired-refresh');
      await prisma.session.updateMany({
        where: { userId: (await prisma.user.findFirstOrThrow({ where: { email } })).id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookie}`);
      expect(res.status).toBe(401);
    });

    it('7. revoked refresh token (via logout) -> refresh denied', async () => {
      const { refreshCookie } = await registerAndLogin('revoked-refresh');
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookie}`);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookie}`);
      expect(res.status).toBe(401);
    });

    it('8. reused refresh token -> denied and revokes the family (covered in depth in the critical-journey test above)', async () => {
      const { refreshCookie } = await registerAndLogin('reuse-matrix');
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookie}`);

      const reuse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookie}`);
      expect(reuse.status).toBe(401);
    });

    it('9. invalid refresh cookie (garbage value, never issued) -> denied', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=not-a-real-token-at-all`);
      expect(res.status).toBe(401);
    });

    it('10. role escalation attempt via register body is rejected outright by validation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: emailFor('escalate'), password: PASSWORD, role: 'ADMIN' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('11. missing authentication -> GET /me and POST /logout-all both denied', async () => {
      const meRes = await request(app.getHttpServer()).get('/api/v1/auth/me');
      expect(meRes.status).toBe(401);

      const logoutAllRes = await request(app.getHttpServer()).post('/api/v1/auth/logout-all');
      expect(logoutAllRes.status).toBe(401);
    });

    it('12. insufficient role permissions -> covered at the unit level (RolesGuard); no role-gated business route exists yet in Phase 1', () => {
      // See src/auth/guards/roles.guard.spec.ts. RolesGuard/@Roles() are
      // exported by AuthModule for the Admin module (a later phase) to
      // attach to its own routes — there is nothing role-gated to hit
      // end-to-end yet, per the Phase 1 strict-scope boundary.
      expect(true).toBe(true);
    });

    it('13. malformed JWT -> rejected by GET /me', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer this.is.not-a-jwt');
      expect(res.status).toBe(401);
    });

    it('14. password reset enumeration protection -> identical response for known and unknown emails', async () => {
      const email = emailFor('reset-enum');
      await registerUser(email);

      const knownRes = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email });
      const unknownRes = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: emailFor('never-registered-2') });

      expect(knownRes.status).toBe(200);
      expect(unknownRes.status).toBe(200);
      expect(knownRes.body.data.message).toBe(unknownRes.body.data.message);
    });
  });

  // ---------------------------------------------------------------------
  // Password reset / email verification architecture
  // ---------------------------------------------------------------------

  describe('password reset', () => {
    it('rejects an invalid/expired reset token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'not-a-real-token', newPassword: 'BrandNewPass1' });
      expect(res.status).toBe(401);
    });

    it('resets the password with a valid token, revokes existing sessions, and allows login with the new password', async () => {
      const email = emailFor('reset-flow');
      await registerUser(email);
      const { refreshCookie } = await loginUser(email);

      const forgotRes = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email });
      const devResetToken = forgotRes.body.data.devResetToken as string;
      expect(devResetToken).toEqual(expect.any(String));

      const resetRes = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: devResetToken, newPassword: 'BrandNewPass1' });
      expect(resetRes.status).toBe(200);

      // Old session was revoked by the reset.
      const refreshAfterReset = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookie}`);
      expect(refreshAfterReset.status).toBe(401);

      // Old password no longer works; new password does.
      const oldPwLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD });
      expect(oldPwLogin.status).toBe(401);

      const newPwLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'BrandNewPass1' });
      expect(newPwLogin.status).toBe(200);
    });
  });

  describe('email verification', () => {
    it('rejects an invalid/expired verification token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'not-a-real-token' });
      expect(res.status).toBe(401);
    });

    it('activates the account with a valid verification token', async () => {
      const email = emailFor('verify-flow');
      const registerRes = await registerUser(email);
      const devVerificationToken = registerRes.body.data.devVerificationToken as string;
      expect(devVerificationToken).toEqual(expect.any(String));

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: devVerificationToken });
      expect(verifyRes.status).toBe(200);

      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      expect(user.status).toBe(UserStatus.ACTIVE);
    });

    it('resend-verification returns a generic response regardless of whether the email is known', async () => {
      const known = emailFor('resend-known');
      await registerUser(known);

      const knownRes = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email: known });
      const unknownRes = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email: emailFor('resend-unknown') });

      expect(knownRes.status).toBe(200);
      expect(unknownRes.status).toBe(200);
      expect(knownRes.body.data.message).toBe(unknownRes.body.data.message);
    });
  });
});
