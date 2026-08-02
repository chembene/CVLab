# CVLab AI

CVLab AI is a career-development SaaS platform: AI-assisted CV building, cover letters, ATS
analysis, technical tests and interview practice — built first for the Mozambican job market
(Portuguese, MZN/MT), architected to expand internationally.

> **Status: Phase 2A — Resume Engine Foundation.** Implemented so far: monorepo/infrastructure
> foundation (Phase 0), full authentication & identity (Phase 1), and the Master Resume engine —
> Profile, Master Resume, and 11 resume sections (Phase 2A). Credits, payments, AI, CV export, ATS
> analysis, tests and interviews are **not** implemented yet.
> See [`docs/development/roadmap.md`](docs/development/roadmap.md) for what comes next.

## Architecture Overview

This is an npm-workspaces monorepo:

```
apps/
  web/      Next.js 14 (App Router) + React + TypeScript + Tailwind CSS — frontend
  api/      NestJS + TypeScript — backend
packages/
  ui/       Shared, reusable, accessible React components (Button, Card, ...)
  types/    Shared TypeScript types/enums — the frontend/backend contract
  config/   Shared ESLint + TypeScript base configuration
prisma/     Database schema (PostgreSQL via Prisma) — single source of truth for the data model
docs/       Architecture, product and development documentation (read this first)
prompts/    Authoritative project rules (coding standards, security, business rules, ...)
```

Full architecture decisions live in [`docs/architecture/`](docs/architecture) and
[`docs/product/mvp-scope.md`](docs/product/mvp-scope.md) — those documents are the source of
truth; this README only describes how to run what's implemented so far.

Backend design (per [`docs/architecture/system-architecture.md`](docs/architecture/system-architecture.md)):

- Clean layering: Controller → Service → Repository → Database.
- Every API response follows the `{ success, data }` / `{ success: false, error }` envelope
  (`prompts/13-api-contracts.md`), applied via a global response interceptor and exception filter.
- Routes are versioned under `/api/v1`.
- Global `ValidationPipe`, Helmet, CORS, and rate limiting (`@nestjs/throttler`) are wired up.
- JWT access tokens (15 min) + rotating opaque refresh tokens (30 days, HttpOnly cookie, reuse
  detection) power authentication; RBAC (`USER`/`ADMIN`/`SUPER_ADMIN`) is enforced via
  `JwtAuthGuard`/`RolesGuard`. See [`docs/architecture/security-architecture.md`](docs/architecture/security-architecture.md).
- Domain events (`@nestjs/event-emitter`) drive cross-cutting side effects — e.g. every
  Profile/Master Resume/Section mutation writes a `history_events` row via `HistoryListener`. See
  [`docs/architecture/system-architecture.md`](docs/architecture/system-architecture.md) §4.
- `PrismaService` and `RedisService` are global, injectable connection wrappers used by the
  `/api/v1/health` endpoint to prove real DB/cache connectivity.

## Implemented Modules

| Module                                                          | Status                 | Docs                                                                                             |
| --------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| Auth & Identity                                                 | Implemented (Phase 1)  | [`docs/architecture/security-architecture.md`](docs/architecture/security-architecture.md)       |
| Profile                                                         | Implemented (Phase 2A) | [`docs/architecture/master-resume-data-model.md`](docs/architecture/master-resume-data-model.md) |
| Master Resume + 11 sections                                     | Implemented (Phase 2A) | [`docs/architecture/master-resume-data-model.md`](docs/architecture/master-resume-data-model.md) |
| Credits, Payments, AI, CV export, ATS, Tests, Interviews, Admin | Not implemented        | [`docs/development/roadmap.md`](docs/development/roadmap.md)                                     |

Frontend: `/login`, `/register`, `/dashboard/profile` (personal info form), `/dashboard/resume`
(Master Resume summary + one independent card per section, add/edit/delete/reorder — never one
giant form) — all in Portuguese, all requiring an authenticated session (`/dashboard/*` redirects
to `/login` otherwise).

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10 (ships with Node 20)
- Docker + Docker Compose (for local PostgreSQL and Redis)

## Installation

```bash
npm install
```

This installs all workspaces (`apps/*`, `packages/*`) in one pass via npm workspaces.

## Environment Setup

```bash
cp .env.example .env
```

`.env.example` documents every variable the platform will eventually need, grouped by phase.
`NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, the CORS/URL variables, and — as of Phase 1 —
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (min 32 chars each) plus their TTL variables are read and
validated at boot (fails fast on missing/malformed config, per `env.validation.ts`'s Joi schema).
The OpenAI/R2/M-Pesa placeholders are still reserved for later phases. **Never commit a real
`.env` file.**

The default `.env.example` values already match `docker-compose.yml`'s default Postgres
credentials, so local setup works out of the box without editing anything.

## Local Development

1. Start local infrastructure:

   ```bash
   npm run docker:up
   ```

2. Generate the Prisma client and apply migrations:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

3. Run both apps in watch mode:

   ```bash
   npm run dev
   ```

   - Frontend: http://localhost:3000
   - Backend: http://localhost:4000/api/v1/health

To stop local infrastructure: `npm run docker:down`.

## Testing

```bash
npm run typecheck      # TypeScript, no emit, across every workspace
npm run lint           # ESLint across every workspace
npm run test:unit      # Jest unit tests (api + web)
npm run test:e2e -w @cvlab/api   # Nest e2e (supertest) — needs postgres/redis running
npm run test:e2e -w @cvlab/web   # Playwright e2e — see note below
```

**Playwright note:** `apps/web` ships a Playwright config and one smoke spec
(`apps/web/e2e/landing.spec.ts`), but browser binaries are not installed automatically by
`npm install`. Run `npx playwright install chromium` once (inside `apps/web`) before the first
`npm run test:e2e -w @cvlab/web`. CI intentionally does not run the Playwright suite yet, to avoid
that extra download on every run — see "Known Limitations" in the Phase 0 completion report.

**Web unit tests** (`apps/web/__tests__/`, `apps/web/lib/*.test.ts(x)`) cover the API client
envelope handling, `AuthProvider`'s session-restore/login/logout flows, the landing page's
logged-in/logged-out states, the `/dashboard/*` route guard, the Profile page, and the generic
`SectionManager` (add/list/delete) — run via Jest + React Testing Library with `fetch` mocked, no
real backend required.

**API e2e tests** (`apps/api/test/`) run against real Postgres + Redis (via `docker:up`), never
mocked — `auth.e2e-spec.ts` covers the 14 authentication security cases (wrong password, unknown
email, suspended/deleted accounts, expired/revoked/reused refresh tokens, role escalation, etc.);
`resume-engine.e2e-spec.ts` covers Profile/Master Resume/all 11 sections, cross-user isolation,
completion-percentage recalculation, and history events (46 tests).

## Docker

`docker-compose.yml` provides **local development infrastructure only** (PostgreSQL 16, Redis 7) —
there is no production Docker setup yet; that's a Phase 15 (Production Preparation) concern.

```bash
npm run docker:up     # docker compose up -d postgres redis
npm run docker:down   # docker compose down
```

## Database

The Prisma schema (`prisma/schema.prisma`) covers the full Phase 0 data model (identity, CVs —
dormant, see below, credit ledger, payments, AI request tracking, tests, interviews, notifications,
history, audit logs), extended in Phase 1 (sessions, verification/password-reset tokens) and Phase
2A (Profile redesign, Master Resume, 11 resume sections). See
[`docs/architecture/database-overview.md`](docs/architecture/database-overview.md) for the
authoritative entity-by-entity rationale and
[`docs/architecture/master-resume-data-model.md`](docs/architecture/master-resume-data-model.md)
for the Master Resume model specifically.

```bash
npm run db:generate         # regenerate the Prisma client after a schema change
npm run db:migrate          # create + apply a migration in development
npm run db:migrate:deploy   # apply existing migrations (CI/production style)
npm run db:studio           # open Prisma Studio
```

Auth, Profile, and Master Resume/Sections query this schema in production. Credits, payments, CVs,
AI, tests, and interviews do not yet — their tables exist but are dormant, prepared ahead of the
phases that implement them.

## Available Root Scripts

| Script                                                                   | Purpose                                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `npm run dev`                                                            | Run `web` and `api` concurrently in watch mode                    |
| `npm run build`                                                          | Build `@cvlab/types`, then `api`, then `web`, in dependency order |
| `npm run lint` / `lint:fix`                                              | ESLint across every workspace                                     |
| `npm run format` / `format:check`                                        | Prettier across the repo                                          |
| `npm run typecheck`                                                      | `tsc --noEmit` across every workspace                             |
| `npm run test` / `test:unit`                                             | Unit tests across every workspace                                 |
| `npm run test:e2e`                                                       | E2E tests across every workspace (see per-app notes above)        |
| `npm run db:generate` / `db:migrate` / `db:migrate:deploy` / `db:studio` | Prisma                                                            |
| `npm run docker:up` / `docker:down`                                      | Local Postgres + Redis                                            |

## Code Quality

- TypeScript strict mode everywhere (`packages/config/typescript/base.json`).
- ESLint (`packages/config/eslint/*`) + Prettier, shared across all workspaces.
- Husky `pre-commit` hook runs `lint-staged` (ESLint + Prettier on staged files) and a full
  `typecheck`. Configured automatically by `npm install` via the `prepare` script.

## Project Structure

```
.
├── apps/
│   ├── api/                  NestJS backend
│   │   ├── src/
│   │   │   ├── common/               Logger, global exception filter, response interceptor,
│   │   │   │                         owner-or-admin authorization util, domain events
│   │   │   ├── config/                Env validation + ConfigModule wiring
│   │   │   ├── health/                 GET /api/v1/health
│   │   │   ├── prisma/                 PrismaService (global)
│   │   │   ├── redis/                  RedisService (global)
│   │   │   ├── users/                  User identity, RBAC roles
│   │   │   ├── auth/                   Register/login/refresh/logout, tokens, sessions, guards
│   │   │   ├── profile/                Personal/contact info (Phase 2A)
│   │   │   ├── master-resume/          Master Resume summary + completion% (Phase 2A)
│   │   │   ├── resume-sections/        Generic engine for all 11 resume sections (Phase 2A)
│   │   │   ├── resume-completion/      Completion-percentage calculator (Phase 2A)
│   │   │   ├── history/                Domain-event listener writing history_events (Phase 2A)
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── test/                       e2e (supertest), against real Postgres/Redis
│   └── web/                  Next.js frontend
│       ├── app/                        App Router — landing, login, register, dashboard/profile,
│       │                               dashboard/resume
│       ├── components/                 SectionManager (generic, drives all 11 section cards)
│       ├── lib/                        api-client, auth-context, section-fields registry
│       ├── __tests__/, lib/*.test.tsx  Jest + React Testing Library
│       └── e2e/                        Playwright
├── packages/
│   ├── ui/                   Shared React components
│   ├── types/                Shared TS types/enums (frontend/backend contract)
│   └── config/               Shared ESLint + TypeScript base config
├── prisma/
│   └── schema.prisma          Full Phase 0 data model
├── docs/                      Architecture, product, development documentation
├── prompts/                   Authoritative project rules
├── docker-compose.yml          Local Postgres + Redis
└── .github/workflows/ci.yml   Install → typecheck → lint → migrate → test → build
```

## Contributing

Read [`CLAUDE.md`](CLAUDE.md) and everything under [`prompts/`](prompts) before making changes —
those are the authoritative engineering and business rules for this project. Commit messages
follow [Conventional Commits](prompts/06-git-workflow.md).
