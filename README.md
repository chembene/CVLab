# CVLab AI

CVLab AI is a career-development SaaS platform: AI-assisted CV building, cover letters, ATS
analysis, technical tests and interview practice — built first for the Mozambican job market
(Portuguese, MZN/MT), architected to expand internationally.

> **Status: Phase 0 — Project Foundation.** No product features are implemented yet. This repo
> currently contains the monorepo scaffold, database schema, and infrastructure foundation only.
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

Backend design (Phase 0 foundation, per [`docs/architecture/system-architecture.md`](docs/architecture/system-architecture.md)):

- Clean layering: Controller → Service → Repository → Database.
- Every API response follows the `{ success, data }` / `{ success: false, error }` envelope
  (`prompts/13-api-contracts.md`), applied via a global response interceptor and exception filter.
- Routes are versioned under `/api/v1`.
- Global `ValidationPipe`, Helmet, CORS, and a rate-limit foundation (`@nestjs/throttler`) are
  wired up; authentication/RBAC are **not** implemented yet (Phase 1).
- `PrismaService` and `RedisService` are global, injectable connection wrappers used by the
  `/api/v1/health` endpoint to prove real DB/cache connectivity.

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

`.env.example` documents every variable the platform will eventually need, grouped by phase. Only
`NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, and the CORS/URL variables are actually read in
Phase 0 — the JWT/OpenAI/R2/M-Pesa placeholders are reserved for later phases so the shape of
configuration doesn't change later. **Never commit a real `.env` file.**

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

## Docker

`docker-compose.yml` provides **local development infrastructure only** (PostgreSQL 16, Redis 7) —
there is no production Docker setup yet; that's a Phase 15 (Production Preparation) concern.

```bash
npm run docker:up     # docker compose up -d postgres redis
npm run docker:down   # docker compose down
```

## Database

The Prisma schema (`prisma/schema.prisma`) implements the full Phase 0 data model — 20 entities
covering identity, CVs (structured JSONB documents with versioning), the credit ledger, payments,
AI request tracking, tests, interviews, notifications, history and audit logs. See
[`docs/architecture/database-overview.md`](docs/architecture/database-overview.md) for the
authoritative entity-by-entity rationale.

```bash
npm run db:generate         # regenerate the Prisma client after a schema change
npm run db:migrate          # create + apply a migration in development
npm run db:migrate:deploy   # apply existing migrations (CI/production style)
npm run db:studio           # open Prisma Studio
```

No business modules (auth, CVs, credits, payments, ...) query this schema yet — Phase 0 only
proves the schema itself is valid and migratable.

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
│   │   │   ├── common/       Logger, global exception filter, response interceptor
│   │   │   ├── config/       Env validation + ConfigModule wiring
│   │   │   ├── health/       GET /api/v1/health
│   │   │   ├── prisma/       PrismaService (global)
│   │   │   ├── redis/        RedisService (global)
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── test/             e2e (supertest)
│   └── web/                  Next.js frontend
│       ├── app/               App Router (layout, landing/status page)
│       ├── __tests__/         Jest + React Testing Library
│       └── e2e/                Playwright
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
