# CVLab AI — Component Library (Phase 10)

Status: implemented. Every component below lives in `apps/web/components/`. See
[design-system.md](design-system.md) for the tokens they consume and
[frontend-architecture.md](frontend-architecture.md) for how they fit into the wider app.

## 1. Primitives (`components/ui/`)

Hand-written shadcn/ui-style components — Radix primitive (where behavior/a11y is non-trivial) + CVA
variants + Tailwind. Each is a thin, fully-owned wrapper, never an installed pre-built component.

| Component            | Radix primitive                              | Variants                                                                                  | Notes                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`             | `@radix-ui/react-slot` (only when `asChild`) | `default`/`destructive`/`outline`/`secondary`/`ghost`/`link` × `default`/`sm`/`lg`/`icon` | `loading` prop disables + shows a spinner; **never** combine `loading` with `asChild` — see [frontend-architecture.md](frontend-architecture.md) §10 for why the two are structurally separate code paths |
| `Input` / `Textarea` | —                                            | —                                                                                         | Plain styled native elements, `forwardRef` for RHF `register()` compatibility                                                                                                                             |
| `Label`              | `@radix-ui/react-label`                      | —                                                                                         |                                                                                                                                                                                                           |
| `Checkbox`           | `@radix-ui/react-checkbox`                   | —                                                                                         |                                                                                                                                                                                                           |
| `Select`             | `@radix-ui/react-select`                     | —                                                                                         | Full compound API (`SelectTrigger`/`SelectContent`/`SelectItem`/…)                                                                                                                                        |
| `Card`               | —                                            | —                                                                                         | `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`                                                                                                                                     |
| `Table`              | —                                            | —                                                                                         | `TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`/`TableCaption`                                                                                                                               |
| `Badge`              | —                                            | `default`/`secondary`/`destructive`/`success`/`warning`/`outline`                         |                                                                                                                                                                                                           |
| `Alert`              | —                                            | `default`/`destructive`/`success`/`warning`                                               | `AlertTitle`/`AlertDescription`                                                                                                                                                                           |
| `Dialog`             | `@radix-ui/react-dialog`                     | —                                                                                         | Full compound API; used for every "create"/"edit" form and every `ConfirmDialog`                                                                                                                          |
| `Sheet`              | `@radix-ui/react-dialog`                     | `side: 'left' \| 'right'`                                                                 | Slide-in drawer — powers `MobileNav`                                                                                                                                                                      |
| `Progress`           | `@radix-ui/react-progress`                   | —                                                                                         | Used for completion % and score breakdowns                                                                                                                                                                |
| `Skeleton`           | —                                            | —                                                                                         | `animate-pulse` block, sized per-context by the caller                                                                                                                                                    |
| `Toaster` (sonner)   | —                                            | —                                                                                         | Mounted once in `app/layout.tsx`; call `toast.success()`/`toast.error()` from anywhere                                                                                                                    |
| `Avatar`             | `@radix-ui/react-avatar`                     | —                                                                                         | Used by `UserMenu` (initials fallback, no photo upload in this phase)                                                                                                                                     |
| `DropdownMenu`       | `@radix-ui/react-dropdown-menu`              | —                                                                                         | Row actions (list pages), `UserMenu`, `NotificationsMenu`                                                                                                                                                 |
| `Separator`          | `@radix-ui/react-separator`                  | —                                                                                         |                                                                                                                                                                                                           |
| `Tabs`               | `@radix-ui/react-tabs`                       | —                                                                                         | Built, currently unused by any page in this phase (available for a future phase)                                                                                                                          |
| `Tooltip`            | `@radix-ui/react-tooltip`                    | —                                                                                         | Built, currently unused by any page in this phase (available for a future phase)                                                                                                                          |

## 2. Cross-Feature Composites (`components/*.tsx`)

Built once, reused across every domain's list/detail pages — the concrete answer to "build reusable
components only, avoid duplicated UI":

- **`PageHeader`** — title, optional description, optional breadcrumb trail, right-aligned actions slot.
  Every one of the ~15 dashboard pages opens with this.
- **`EmptyState`** / **`ErrorState`** — the two non-happy-path states every list/detail page needs; see
  [design-system.md](design-system.md) §9.
- **`ConfirmDialog`** — themed replacement for `window.confirm()`, used by every delete/archive action.
- **`StatCard`** — dashboard stat tile (icon, label, value, optional loading skeleton).
- **`ScoreBadge`** — the shared 0–100 score chip with the fixed success/warning/destructive thresholds
  (§Design System §2); used by ATS reports, Resume Optimization (before/predicted), and Interview scores
  — three features, one component, one color rule.
- **`StatusBadge`** — maps any backend status string (`OptimizationStatus`, `CoverLetterStatus`,
  `JobTargetStatus`, `InterviewStatus`, …) to a consistent badge tone via a small allow-list, falling back
  to `secondary` for anything unrecognized rather than crashing.
- **`PriorityBadge`** — the same idea, specific to `SuggestionPriority` (Resume Optimization).
- **`ResumeVariantSelect`** — the "pick a Resume Variant" dropdown needed by ATS, Resume Optimization,
  Cover Letter generation, and Interview start — one component instead of four near-identical selects.
- **`SectionManager`** — pre-existing from Phase 2A, restyled this phase onto the new primitives
  (Dialog-based add/edit instead of inline expand, `ConfirmDialog` instead of `window.confirm`); still the
  one generic engine behind all 11 Master Resume section types.

## 3. Layout Components (`components/layout/`)

- **`Sidebar`** (+ **`SidebarNav`**, the shared link-list content) — desktop-only (`hidden lg:flex`),
  driven entirely by `lib/nav-items.ts`.
- **`MobileNav`** — hamburger-triggered `Sheet` wrapping the _same_ `SidebarNav`, so desktop and mobile
  navigation cannot drift apart (one source of truth, per §"avoid duplicated UI").
- **`Topbar`** — sticky header combining `MobileNav` trigger, `TopbarBreadcrumb`, `NotificationsMenu`,
  `ThemeToggle`, `UserMenu`.
- **`TopbarBreadcrumb`** — derives a one-level "where am I" trail from the current pathname against
  `nav-items.ts`; page-specific deeper trails (e.g. a job target's own title) are layered on via each
  page's own `<PageHeader breadcrumbs={...}>`.
- **`UserMenu`** — avatar dropdown (profile/settings links, logout).
- **`NotificationsMenu`** — mock data, disclosed (see [frontend-architecture.md](frontend-architecture.md) §7).
- **`ThemeToggle`** — light/dark cycle button.
- **`Footer`** — static copyright line.

## 4. Feature-Specific Composites

- **`components/job-targets/job-target-form.tsx`** — shared create/edit form (§ above).
- **`components/interview/interview-question-card.tsx`** — one interview question: answer textarea
  (editable while the session is `IN_PROGRESS`), save button, and — once evaluated — the read-only
  score/feedback/strengths/improvements panel. The single most stateful composite in this phase, since it
  has to represent three distinct question lifecycles (unanswered → answered → evaluated) in one component.
- **`components/dashboard/usage-chart.tsx`** — mock weekly credit-usage bar chart (CSS bars, no charting
  library — none was in the specified tech stack).
- **`components/dashboard/recent-list-card.tsx`** — the "Recent ATS / Optimizations / Cover Letters /
  Interviews" dashboard panels, one component parameterized by icon/title/items/empty-label.

## 5. Testing

| File                                  | Covers                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/ui/button.test.tsx`       | Component test — variants, `loading`, `disabled`, and the `asChild` regression (§ frontend-architecture.md §10)                            |
| `components/layout/sidebar.test.tsx`  | Navigation test — every nav group/item renders as a real link to the right `href`; `aria-current="page"` on exact and nested-route matches |
| `app/login/page.test.tsx`             | Form test — Zod validation messages (empty vs. malformed e-mail), successful submit + redirect, server-error surfacing                     |
| `__tests__/page.test.tsx`             | Page rendering — landing page in logged-out and logged-in states                                                                           |
| `__tests__/dashboard-layout.test.tsx` | Page rendering + navigation — auth-gate redirect, sidebar renders once authenticated                                                       |
| `__tests__/profile-page.test.tsx`     | Page rendering + form — load/pre-fill/save/error, via the real `useProfile`/`useUpdateProfile` hooks                                       |
| `__tests__/section-manager.test.tsx`  | Component test — empty state, ordered list rendering, dialog-based add, confirm-dialog-gated delete                                        |
| `lib/api-client.test.ts`              | API layer — envelope handling, auth header, and the new 401 refresh-and-retry logic (3 dedicated cases)                                    |
| `lib/auth-context.test.tsx`           | Pre-existing (Phase 1), unchanged                                                                                                          |

37 tests total, all passing. Coverage is deliberately **representative, not exhaustive** — every distinct
_pattern_ used across the ~15 dashboard pages (list-with-dialog-create, detail-with-edit-form,
multi-step-flow) has at least one test proving it works, rather than one near-duplicate test per page.
