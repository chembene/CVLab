# CVLab AI — Resume Variant Workspace (frontend consolidation)

Status: **implemented** (2026-08-12). Pure frontend composition on top of already-shipped backend modules — [resume-optimization.md](resume-optimization.md) (Phase 7) and the ATS Engine (Phase 4). No backend endpoint, DTO, schema, or business rule changed.

## 1. Why this exists

`/dashboard/resume-variants/[id]` previously exposed ATS scoring and AI optimization only as an "Ações com IA" card whose two buttons linked to `/dashboard/ats-reports` and `/dashboard/optimizations` — generic, unscoped list pages. Clicking either did not run anything against the variant being viewed; the user had to navigate away and find (or create) the right item themselves. Template/theme editing already lived on its own dedicated route, `/dashboard/resume-variants/[id]/template`.

This consolidates all three — score, AI suggestions, template/appearance — into one page with tabs, so every action there actually runs against the variant currently open.

## 2. What changed

```
apps/web/components/resume-variants/
  variant-score-section.tsx         NEW — inline ATS score panel
  variant-optimization-section.tsx  NEW — inline AI optimization panel
  variant-template-section.tsx      NEW — extracted from template/page.tsx

apps/web/app/dashboard/resume-variants/[id]/
  page.tsx                          Rewritten: Tabs (Visão Geral / Pontuação
                                     & Otimização / Modelo & Aparência)
                                     replace the old "Ações com IA" card
  template/page.tsx                 Thin wrapper (PageHeader + breadcrumbs)
                                     around VariantTemplateSection — kept
                                     working as a standalone deep link
```

No new hooks, no new API routes. Each section component composes hooks that already existed:

- `VariantScoreSection` → `useAtsReports()` (filtered client-side by `resumeVariantId`, most recent by `createdAt`) + `useRunAtsAnalysis()`.
- `VariantOptimizationSection` → `useOptimizations()` (same client-side filter) + `useRunOptimization()` + `useApplySuggestions()`.
- `VariantTemplateSection` → `useResumeVariant()` + `useSetResumeVariantTemplate()` + `useUpdateResumeVariantTheme()` + `useResetResumeVariantTheme()` — identical to what `template/page.tsx` did inline before.

## 3. Why client-side filtering, not a new query param

`GET /ats/reports` and `GET /resume-optimization` already return the caller's full list, most recent first, with no `resumeVariantId` filter. Adding one would be a backend change for a frontend-only milestone. Both lists are scoped per-user (not global), so filtering an already-small, already-fetched array in `useMemo` is O(n) on data that's already in memory — no meaningful cost at MVP scale. Revisit with a real query param if a user's list of reports/optimizations grows large enough for this to matter.

## 4. Why `VariantTemplateSection` still self-fetches the variant

It calls `useResumeVariant(variantId)` independently rather than receiving `variant` as a prop. React Query dedupes by query key (`['resume-variants', id]`), so when it's rendered inside a tab on the page that already fetched the same variant, this is a cache hit, not a second network request — while keeping the component fully self-contained and independently usable (it's still the same component powering the standalone `/template` route).

## 5. What was deliberately not touched

- **`/dashboard/ats-reports`, `/dashboard/ats-reports/[id]`, `/dashboard/optimizations`, `/dashboard/optimizations/[id]`** — left exactly as they were. They're still useful as global "everything I've ever run" lists across all variants; this change only fixes the dead-end navigation from a specific variant.
- **`/dashboard/resume-variants/[id]/template`** — kept working standalone for any existing bookmark/deep link, now backed by the shared `VariantTemplateSection` instead of duplicated markup.
- **No backend changes.** `AtsAnalysisService`, `ResumeOptimizationService`, and the Template Engine module are untouched.

## 6. Testing

`apps/web/__tests__/variant-score-section.test.tsx` and `variant-optimization-section.test.tsx` follow the existing `section-manager.test.tsx` pattern (`renderWithQueryClient` + a sequenced `global.fetch` mock, no network). Coverage: the "no job target linked" empty state, the "no report/optimization yet" empty state, correct scoping (a report/optimization belonging to a _different_ variant is ignored, the most recent one for _this_ variant is shown), running a fresh analysis/optimization posts the right `resumeVariantId`, and applying selected suggestions posts the right `suggestionIds`.

**Known limitation of this change:** the sandbox this milestone was implemented in could not execute `npm run test:unit -w apps/web` — the mounted workspace has Windows-created symlinks for the `@cvlab/*` workspace packages that a Linux process can't follow, and a from-scratch `npm install` in a native Linux path couldn't finish downloading `@next/swc-linux-x64-gnu` without registry access. The two new test files were written against the same mocking pattern as the pre-existing, previously-passing `section-manager.test.tsx`, and every hook/prop signature they exercise was cross-checked against its real source (`lib/api/ats.ts`, `lib/api/resume-optimization.ts`) rather than assumed — but they have not actually been run. Run `npm run test:unit -w apps/web` in a normal (non-cross-OS-mounted) environment before shipping this.
