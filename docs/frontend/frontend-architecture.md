# CVLab AI — Frontend Architecture (Phase 10)

Status: implemented. This phase built the complete visual/navigational shell for every backend module
delivered in Phases 1–9 — Auth, Profile, Master Resume, Resume Variants, Job Targets, ATS, Resume
Optimization, Cover Letters, Interview Preparation, Credits, and (mock-backed, see §7) History. **No
backend code changed** — this phase consumes existing APIs exactly as documented in
[api-overview.md](../architecture/api-overview.md); see §9 for the one exception (a frontend-only
resilience fix in `api-client.ts`, not a backend change).

## 1. Tech Stack

Next.js 14 App Router · TypeScript · Tailwind CSS · shadcn/ui (hand-written, see
[design-system.md](design-system.md) §1) · [TanStack React Query](https://tanstack.com/query) v5 ·
[React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev) (via `@hookform/resolvers`) ·
[Lucide](https://lucide.dev) icons · [Framer Motion](https://www.framer.com/motion/) (landing page only —
no other page needed animation beyond Radix's own built-in transitions) · [sonner](https://sonner.emilkowal.ski)
for toasts · [next-themes](https://github.com/pacocoursey/next-themes) for dark mode.

## 2. Directory Layout

```
apps/web/
  app/
    layout.tsx                 # Root: ThemeProvider > QueryProvider > AuthProvider > {children} + Toaster
    page.tsx                   # Public landing page
    login/, register/          # Public auth pages
    dashboard/
      layout.tsx                # Auth-gated shell: Sidebar + Topbar + Footer
      page.tsx                  # Dashboard (stats, chart, recent activity, quick actions)
      profile/, settings/
      resume/                   # Master Resume editor (11 sections)
      resume-variants/, resume-variants/[id]/
      job-targets/, job-targets/[id]/
      ats-reports/, ats-reports/[id]/
      optimizations/, optimizations/[id]/
      cover-letters/, cover-letters/[id]/
      interviews/, interviews/[id]/
      credits/, transactions/, history/
  components/
    ui/                         # shadcn primitives — see component-library.md
    layout/                     # Sidebar, Topbar, MobileNav, UserMenu, NotificationsMenu, ThemeToggle, Footer
    dashboard/                  # UsageChart, RecentListCard
    job-targets/, interview/    # Feature-specific composite components
    *.tsx                       # Cross-feature composites: EmptyState, ErrorState, ConfirmDialog,
                                 # PageHeader, StatCard, ScoreBadge, StatusBadge, PriorityBadge,
                                 # ResumeVariantSelect, SectionManager
  lib/
    api-client.ts               # apiFetch() — envelope handling + 401 refresh-and-retry (§9)
    api/                        # One file per backend domain — types + React Query hooks (§4)
    validation/                 # Zod schemas, one per form
    auth-context.tsx            # AuthProvider/useAuth (session state, login/register/logout)
    query-provider.tsx          # QueryClientProvider with app-wide defaults
    nav-items.ts                 # Single source of truth for sidebar + mobile nav links
    section-fields.ts           # Pre-existing (Phase 2A) — the 11 Master Resume section field configs
    format.ts                   # Date/currency/relative-time/enum-humanizing helpers
    utils.ts                    # cn() — clsx + tailwind-merge, used by every ui/ component
    test-utils.tsx              # renderWithProviders / renderWithQueryClient for tests (§8)
```

## 3. Routing

App Router, one folder per route. Dynamic detail pages use `[id]` segments
(`resume-variants/[id]/page.tsx` etc.), reading the id via `useParams<{ id: string }>()`. All
`/dashboard/**` routes share `app/dashboard/layout.tsx`, which redirects to `/login` when
`useAuth().user` is `null` once the session-restore check finishes (`isLoading` false) — the same
redirect-on-mount pattern Phase 2A established, now wrapped in the new Sidebar/Topbar/Footer shell.

## 4. State Management

Two layers, cleanly separated:

- **Server state** (anything that lives in the backend — profile, resume, job targets, ATS reports,
  optimizations, cover letters, interviews, credits) is owned entirely by **React Query**. Every backend
  domain has one file under `lib/api/<domain>.ts` exporting:
  - TypeScript interfaces mirroring the backend's actual response shape (verified against the real DTOs
    in `apps/api/src/**/dto/*.ts` while building this phase, not guessed).
  - `use<Noun>()` / `use<Noun>s()` query hooks (`queryKey: ['domain', ...params]`).
  - `use<Verb><Noun>()` mutation hooks, each with an `onSuccess` that invalidates the relevant query keys
    (e.g. applying Resume Optimization suggestions invalidates `optimizations`, `resume-variants`, _and_
    `ats-reports`, since a successful apply touches all three domains — see
    [resume-optimization.md](../architecture/resume-optimization.md)).

  No global Redux/Zustand store exists or was needed — React Query's cache _is_ the server-state store,
  matching the brief's explicit "React Query" instruction rather than layering a second state manager on
  top of it.

- **Client/UI state** (form inputs, dialog open/closed, selected checkboxes) is local `useState`/React
  Hook Form state, scoped to the component that owns it. `AuthProvider` (`lib/auth-context.tsx`, unchanged
  from Phase 1/2A) is the one piece of genuinely cross-cutting client state — current user, access token
  lifecycle — and is deliberately kept outside React Query since it isn't really "server data to cache,"
  it's session identity.

## 5. API Layer

`lib/api-client.ts`'s `apiFetch<T>()` is the single fetch wrapper every hook in `lib/api/*.ts` calls
through — no component ever calls `fetch()` directly (the one exception, `Settings` page's
"Terminar todas as sessões" button calling `POST /auth/logout-all`, still goes through `apiFetch`, just
without a dedicated hook file since it's a one-off action, not cached server state). It:

1. Attaches `Authorization: Bearer <token>` from an in-memory module variable (never `localStorage` — see
   [security-architecture.md](../architecture/security-architecture.md) §1.1).
2. Sends `credentials: 'include'` so the httpOnly refresh cookie always travels.
3. Unwraps the `{success,data}` / `{success:false,error}` envelope
   ([api-overview.md](../architecture/api-overview.md)'s documented contract), throwing a typed `ApiError`
   on failure.
4. Transparently retries once via silent refresh on a 401 (§9).

## 6. Forms

Every form in this phase uses React Hook Form + a Zod schema (`lib/validation/*.ts`) via
`zodResolver` — no bare `useState` + manual validation, per the brief's explicit tech-stack list. Shared
patterns:

- Field-level errors render as `<p role="alert">{errors.field?.message}</p>` immediately under the input.
- Submit buttons use `<Button loading={isSubmitting}>` (disables + shows a spinner automatically — see
  [component-library.md](component-library.md) §Button).
- Success/failure surfaces as a `sonner` toast (`toast.success(...)`/`toast.error(...)`), never a
  page-level "banner" that pushes layout around — this was a deliberate, consistent choice across all
  ~10 mutating forms in this phase.
- Two forms (Job Target create/edit, in `components/job-targets/job-target-form.tsx`) share **one**
  component instead of duplicating the field list between the list page's "new" dialog and the detail
  page's edit view — the concrete instance of the brief's "avoid duplicated UI" instruction.

## 7. Mock Data Disclosure

Per the brief ("Use mock data only where endpoints do not yet exist"), exactly three UI surfaces use mock
data, each explicitly commented in its source file and (for the user-facing one) labeled in the UI itself:

| Surface                | File                                       | Why                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notifications dropdown | `components/layout/notifications-menu.tsx` | No `/notifications` endpoint exists in any backend phase (Phase 0's `Notification` model is schema-only)                                                                                                                                                                        |
| Dashboard usage chart  | `components/dashboard/usage-chart.tsx`     | No analytics/usage-over-time endpoint exists (Analytics remains a conceptual module per [module-boundaries.md](../architecture/module-boundaries.md))                                                                                                                           |
| History page           | `app/dashboard/history/page.tsx`           | `GET /history` has no controller yet — the _write_ side (`HistoryListener`) has existed since Phase 2A, but nothing reads it back over HTTP. `lib/api/history.ts`'s `useHistoryEvents()` hook is written against the response shape that endpoint will return, ready to swap in |

Every other page in this phase reads and writes real backend data.

## 8. Testing

Jest + React Testing Library (pre-existing Phase 0 setup, `jest.config.js`/`jest.setup.ts`, both extended
this phase — see below). `lib/test-utils.tsx` provides two render helpers:

- `renderWithProviders` — wraps `QueryClientProvider` + `AuthProvider`, for anything using `useAuth()`.
  Callers must account for `AuthProvider`'s own mount-time `POST /auth/refresh` call as fetch-mock call
  #1 (documented inline in the helper and in every test file that uses it).
- `renderWithQueryClient` — `QueryClientProvider` only, for components that don't need auth context
  (avoids the above bookkeeping entirely — preferred when the component under test allows it).

`jest.setup.ts` additionally mocks `sonner` (assert on `toast.success`/`toast.error` calls rather than
querying portal-rendered DOM) and stubs `window.matchMedia` (required by `next-themes` in jsdom). See
[component-library.md](component-library.md) §Testing for what's covered where.

## 9. The One Cross-Cutting Frontend Fix: 401 Refresh-and-Retry

Earlier phases' `apiFetch()` had a documented limitation: "no automatic silent-refresh-and-retry when an
access token expires mid-session." This phase resolves it — `apiFetch()` now catches a 401, attempts one
`POST /auth/refresh` (de-duplicated via a shared in-flight promise so N simultaneous 401s trigger exactly
one refresh call, not N), and retries the original request once with the new token. `/auth/refresh` and
`/auth/login` are excluded from the retry path itself, to avoid an infinite loop. This is a frontend-only
resilience improvement — no backend endpoint, contract, or behavior changed; `POST /auth/refresh` already
existed and behaved exactly this way since Phase 1.

## 10. A Real Bug Found and Fixed During This Phase

`components/ui/button.tsx`'s `asChild` (Radix `Slot`) path originally rendered the same
`{loading && <Loader2/>}{children}` JSX regardless of `asChild`. Radix `Slot` requires **exactly one**
element child; a conditional expression that evaluates to `false` (e.g. `loading={false}`) still counts
as an extra child node, so **every** `<Button asChild><Link>...</Link></Button>` usage anywhere in the app
crashed Next's static prerender (`"Slot failed to slot onto its children"`) — including the landing page's
own primary CTA button, caught only by running `npm run build`, not `next lint`. Fixed by branching:
`asChild` renders `<Slot>{children}</Slot>` directly, never touching the loading-spinner children; the
plain `<button>` path is unaffected. Covered by `components/ui/button.test.tsx`'s dedicated `asChild`
test so this exact regression can't reappear silently.

## 11. What Was Deliberately Not Built

Per the brief's explicit exclusions: no PDF/DOCX export UI, no streaming (AI Orchestration's `stream()`
method remains provider-interface-only, per [ai-orchestration.md](../architecture/ai-orchestration.md)),
no admin-facing screens (the backend's `/admin/*` routes are conceptual only, per
[api-overview.md](../architecture/api-overview.md)), no in-app password-change form (the backend exposes
only the logged-out password-reset flow — `/dashboard/settings` links to it and discloses the gap rather
than faking a form that would 404).
