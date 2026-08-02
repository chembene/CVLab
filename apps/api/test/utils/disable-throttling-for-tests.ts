import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Test-side only — production ThrottlerModule config and every @Throttle()
 * decorator stay untouched; nothing under src/ is modified. E2E suites that
 * fire many requests back-to-back (register/login loops, etc.) legitimately
 * trip the real per-minute limits, which isn't what those tests are about.
 *
 * ThrottlerGuard is registered globally via the APP_GUARD token in
 * AppModule, not via a per-route @UseGuards() decorator. Neither
 * `.overrideGuard(ThrottlerGuard)` nor `.overrideProvider(APP_GUARD)` from
 * @nestjs/testing actually intercepts it in that configuration (both were
 * tried and verified, via the real ThrottlerGuard.canActivate still
 * appearing in thrown-exception stack traces, to leave the real guard
 * running) — a known limitation of Nest's global-guard DI wiring. Patching
 * the prototype method directly works regardless of how the instance was
 * constructed/injected, and is scoped to whichever test file calls this
 * (Jest gives each test file its own module registry, so it never leaks
 * into other suites).
 *
 * Call in `beforeAll`; call `.mockRestore()` on the returned spy in `afterAll`.
 */
export function disableThrottlingForTests(): jest.SpyInstance {
  return jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);
}
