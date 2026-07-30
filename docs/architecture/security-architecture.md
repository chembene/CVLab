# CVLab AI — Security Architecture

Status: resolved decisions (approved 2026-07-30), derived from `prompts/05-security.md`, `prompts/00-rules.md`, `prompts/12-mpesa-integration.md` §18–19, `prompts/13-api-contracts.md` §22.

## 1. Authentication

- JWT access tokens + refresh tokens.
- Passwords hashed with bcrypt — never stored or logged in plain text.
- Email verification and password-reset flows are architected in Phase 1 (implementation may follow, but the token/flow design exists from the start).

### 1.1 Token Storage & Lifecycle (resolved)

Server-oriented design — refresh tokens are not exposed to frontend JavaScript unnecessarily.

| Aspect | Decision |
|---|---|
| Access token | Short-lived, **15 minutes**. Returned in the response body, held in memory on the frontend (not persisted to `localStorage`), sent as `Authorization: Bearer <token>`. |
| Refresh token | Longer-lived, **30 days**. Delivered as a **secure, `HttpOnly`, `SameSite=Strict` (or `Lax` if cross-subdomain flows require it) cookie** — never returned in a JSON body, never readable by frontend JS. |
| Rotation | **Rotate on every use.** Each refresh call invalidates the presented refresh token and issues a new one. The old token is marked used in a `refresh_tokens` (or session) table. |
| Reuse detection | If an already-used/invalidated refresh token is presented again, treat it as a compromise signal: revoke the entire token family (all descendants of that token) and force re-authentication. |
| Revocation | Refresh tokens are tracked server-side (a `refresh_tokens` table keyed by a hashed token value, or a session table), not purely stateless — this is what makes "log out everywhere," "revoke on password change," and reuse detection possible. Access tokens are stateless JWTs and are not individually revocable, which is exactly why their lifetime is kept short (15 min worst-case exposure window). |

This is an **architecture decision only** — no authentication code is implemented in this pass, per the task scope.

### 1.2 Admin MFA (resolved: extensible, not implemented in MVP)

MFA does not block MVP launch, but the auth design must not require a redesign to add it later:

- `users` (or an admin-specific extension) carries `mfa_enabled: boolean` and `mfa_method: enum | null` (nullable, unused until MFA ships).
- The login flow is designed as two conceptual steps even though step 2 is a no-op in MVP: **(1) verify credentials → issue a "pending MFA" short-lived token if `mfa_enabled`, else issue full tokens directly; (2) verify second factor → issue full tokens.** Building the login state machine with this branch point now — even with `mfa_enabled` always `false` — means turning MFA on later is "implement step 2," not "redesign login."
- No third-party MFA provider (TOTP library, SMS provider, etc.) is selected or integrated at this stage, per the task scope — that choice is deferred to whenever MFA is actually scheduled.
- Recommended (not yet decided) future scope: require MFA for `ADMIN`/`SUPER_ADMIN` roles first, given they can adjust credits and view payment data.

## 2. Authorization

- Role-based access control: `USER`, `ADMIN`, `SUPER_ADMIN`.
- Authentication does not imply authorization — every protected resource additionally checks ownership or role (e.g., a user may only access their own CVs; only ADMIN+ may access `/admin/*`).
- Admin vs. super-admin boundary (system config, integrations, permissions management) is `SUPER_ADMIN`-only per `prompts/09-product-vision.md` §4.

## 3. API Hardening

- Rate limiting globally, with stricter limits on: login, password reset, AI endpoints, payment endpoints, test submission, interview submission.
- Input validation on every request body via DTOs + class-validator; never trust client-supplied IDs, prices, credit amounts, roles, or payment status.
- CORS restricted to known frontend origins.
- Helmet (or equivalent) security headers.
- Standard HTTP status codes only; error bodies never leak stack traces, SQL errors, internal architecture, or provider credentials (`prompts/13-api-contracts.md` §22).

## 4. Financial/Payment Security

- Payment amount is always derived server-side from the configured `credit_packages` entry — the frontend-submitted amount is never trusted (`prompts/12-mpesa-integration.md` §7).
- Payment confirmation is never accepted from frontend state, browser redirect, or user claim — only backend-verified provider status (`prompts/12-mpesa-integration.md` §10).
- Callback/webhook endpoints validate the request, verify the transaction with the provider, and process idempotently by provider reference before writing anything (`prompts/12-mpesa-integration.md` §11, §13).
- All M-Pesa credentials/secrets live server-side only (env vars or a secret manager) — never shipped to the frontend, never committed. See [payment-architecture.md](payment-architecture.md).

## 5. Secrets & Configuration

- No API keys, secrets, passwords, or tokens in code or in Git history.
- `.env*` files are never committed (enforced by the repository `.gitignore`, already in place).
- Environment variables are split by environment: development / testing / production.

## 6. Data Classification (resolved)

| Level | Examples |
|---|---|
| `PUBLIC` | Marketing content, public template previews (none yet in MVP — no public candidate profiles) |
| `INTERNAL` | System logs (with sensitive fields scrubbed), aggregate analytics, feature-cost configuration |
| `SENSITIVE` | Phone number, email address, CV content, payment references (provider transaction reference, amounts) |
| `HIGHLY_SENSITIVE` | Password hashes, authentication tokens (access/refresh), MFA secrets |

Handling rules by level:

- `HIGHLY_SENSITIVE`: never logged, never returned in any API response body (password hashes are never serialized; tokens are only ever returned once, at issuance, over TLS).
- `SENSITIVE`: access-controlled to the owning user + authorized admin roles; included in exports the user requests (`prompts/10-business-rules.md` §18) but never in application logs.
- `INTERNAL`: visible to admin tooling; not exposed via public/user-facing APIs.
- `PUBLIC`: no restrictions.

**Never logged, at any level:** passwords, tokens, API secrets, payment credentials (restated from `prompts/00-rules.md`, `prompts/05-security.md` §"Logging", `prompts/12-mpesa-integration.md` §19). Safe-to-log payment fields remain: `payment_id`, `provider`, `amount`, `status`, `timestamp`, `transaction reference`.

## 7. Retention Strategy (documented, not yet implemented)

- **Users, profiles, CVs**: retained while the account is active; soft-deleted (`deleted_at`) on user-initiated deletion, subject to a to-be-defined grace period before any hard purge job runs (no automatic deletion job exists yet — this is policy only, per task scope).
- **`credit_transactions`, `payments`, `audit_logs`**: retained indefinitely, never deleted through normal application flows — required for financial auditability (`prompts/10-business-rules.md` §21, see [database-overview.md](database-overview.md) §"Soft Delete Policy").
- **`ai_requests`**: retained for cost reconciliation/debugging; a future data-minimization pass may define a rolling retention window (e.g. 12–24 months) for the `metadata` field specifically — not decided yet, flagged for a later privacy review rather than guessed here.
- **`history_events`**: user-facing history is retained for the account's lifetime; the underlying table's operational retention/partitioning is an infrastructure concern (see [database-overview.md](database-overview.md) risk note), not a data-deletion policy.
- No automatic deletion jobs are implemented in this pass — this section is policy intended to guide Phase 0+ implementation, not a shipped feature.

## 8. Compliance Baseline

- OWASP Top 10 is the minimum compliance bar for all API and web surface area.
- Data ownership: users can export, update, and (subject to legal/operational constraints) delete their data (`prompts/10-business-rules.md` §18).
