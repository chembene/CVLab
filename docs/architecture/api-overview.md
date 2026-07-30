# CVLab AI — API Overview (Conceptual)

Status: conceptual endpoint groups for MVP scope, per `prompts/13-api-contracts.md`. **No implementation yet.**

Base path: `/api/v1`. Envelope, status codes, auth header, pagination/filter/sort conventions, idempotency requirements, and rate-limit priorities are all defined in `prompts/13-api-contracts.md` and are treated as fixed contract rules, not proposals.

## Modules → Endpoint Groups

| Module | Endpoint group | Notes |
|---|---|---|
| Auth | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/verify-email`, `/auth/password-reset` | Strong rate limiting required (§21) |
| Users | `/users/me` | Self-service only in MVP; admin user management under `/admin/users` |
| Profile | `/profile` | GET/PATCH own profile |
| CVs | `/cvs`, `/cvs/:id`, `/cvs/:id/improve`, `/cvs/:id/analyse`, `/cvs/:id/translate` | Improve/analyse/translate are credit-consuming, must support idempotency |
| CV Versions | `/cvs/:id/versions`, `/cvs/:id/versions/:versionId/restore` | Not explicitly listed in `prompts/13-api-contracts.md` §12 list but required by `prompts/10-business-rules.md` §10; model resolved in [cv-data-model.md](cv-data-model.md) — restore creates a new version, never rewrites history |
| Cover Letters | `/cover-letters` | Credit-consuming |
| AI | `/ai/*` (internal orchestration, likely not directly exposed beyond the feature endpoints above) | Prompt management is server-side only |
| ATS | `/ats` | Credit-consuming |
| Interviews | `/interviews`, `/interviews/:id`, `/interviews/:id/answer`, `/interviews/:id/complete` | Credit-consuming, strong rate limit on submission |
| Tests | `/tests`, `/tests/:id`, `/tests/:id/start`, `/test-sessions/:id/answer`, `/test-sessions/:id/complete`, `/test-sessions/:id/result` | Strong rate limit on submission |
| Credits | `GET /credits`, `GET /credits/transactions`, `POST /credits/estimate` | Read/estimate only — backend decides eligibility, no client-side deduction |
| Payments | `POST /payments`, `GET /payments/:id`, `POST /payments/:id/verify`, provider callback endpoint (secured, separate from user-facing API) | Amount always derived server-side from `credit_packages`, never from client input |
| Notifications | `/notifications` | — |
| History | `/history` | Read-only, aggregated |
| Admin | `/admin/users`, `/admin/payments`, `/admin/credits`, `/admin/tests`, `/admin/questions`, `/admin/analytics`, `/admin/logs`, `/admin/settings` | Conceptually and likely route-level separated from user API; RBAC-gated to ADMIN/SUPER_ADMIN |

## Cross-cutting contract rules (already decided, not open questions)

- Every list endpoint paginates (`?page&limit`) and returns `{ items, page, limit, total, totalPages }`.
- Every protected endpoint requires `Authorization: Bearer <token>`; authentication ≠ authorization — ownership/role checks are mandatory per endpoint.
- Payments, credit purchase/consumption, and duplicate-sensitive AI requests must support an idempotency key.
- Swagger/OpenAPI documentation is mandatory per endpoint (description, auth, params, body, responses, errors, examples).
- Breaking changes require a new API version; never silently break an existing client.
- Error responses never leak stack traces, SQL errors, internal architecture, or provider credentials.

## Explicitly out of scope for now

Concrete request/response DTOs, OpenAPI spec files, and controller implementations — these belong to per-module implementation milestones (Phase 1 onward in the roadmap), not to this foundation pass.
