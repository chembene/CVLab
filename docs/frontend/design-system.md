# CVLab AI — Design System (Phase 10)

Status: implemented. Covers `apps/web/tailwind.config.ts`, `apps/web/app/globals.css`, and every
component in `apps/web/components/ui/`.

## 1. Philosophy

One consistent visual language across all ~22 routes, built on [shadcn/ui](https://ui.shadcn.com)'s
convention: components are not an installed npm package but hand-written source living in
`apps/web/components/ui/`, using [Radix UI](https://radix-ui.com) primitives for behavior/accessibility
and [Tailwind CSS](https://tailwindcss.com) + [class-variance-authority](https://cva.style) for styling.
This means every component is fully owned, readable, and editable in this repo — no black-box dependency
to work around when a design needs to diverge from the default.

## 2. Color Palette

Every color is a CSS custom property (HSL triplet, no `hsl()` wrapper so Tailwind can apply opacity
modifiers like `bg-primary/10`) defined in `app/globals.css` under `:root` (light) and `.dark` (dark), and
mapped to Tailwind utility names in `tailwind.config.ts`. `next-themes` toggles the `.dark` class on
`<html>` (see §5); there is no separate "media-only" dark mode path.

| Token                                                                  | Light                                     | Dark                    | Used for                                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `background` / `foreground`                                            | white / near-black                        | near-black / near-white | Page background/text                                                                                        |
| `card` / `card-foreground`                                             | white                                     | dark slate              | `<Card>` surfaces                                                                                           |
| `primary` / `primary-foreground`                                       | `#2563eb`-equivalent blue                 | brighter blue           | Primary actions, active nav, links                                                                          |
| `secondary` / `secondary-foreground`                                   | light gray                                | dark slate              | Secondary buttons, badges                                                                                   |
| `muted` / `muted-foreground`                                           | light gray                                | dark slate              | Disabled/secondary text, skeleton fill                                                                      |
| `accent` / `accent-foreground`                                         | light gray                                | dark slate              | Hover states                                                                                                |
| `destructive` / `destructive-foreground`                               | red                                       | brighter red            | Delete/error actions                                                                                        |
| `success` / `success-foreground`                                       | green                                     | brighter green          | Positive status, high ATS scores                                                                            |
| `warning` / `warning-foreground`                                       | amber                                     | brighter amber          | Mid-range scores, pending states                                                                            |
| `border` / `input` / `ring`                                            | gray                                      | dark gray               | Borders, focus rings                                                                                        |
| `popover` / `popover-foreground`                                       | white                                     | dark slate              | Dropdown/tooltip/select surfaces                                                                            |
| `sidebar` / `sidebar-foreground` / `sidebar-border` / `sidebar-accent` | dedicated dark surface **in both themes** | —                       | The sidebar is deliberately always-dark (a common admin-shell pattern) — its tokens don't flip with `.dark` |

`primary`'s light-mode hue (`221 83% 53%`) was chosen to match the pre-existing Phase 0/2A
`brand-600` (`#2563eb`) exactly, so the rebrand in this phase doesn't shift the one color users had
already seen on the landing page.

**Semantic score thresholds** (not CSS tokens, but a fixed convention used everywhere a 0–100 score is
shown — ATS reports, Resume Optimization predictions, Interview scores): `>=75` → `success`, `>=50` →
`warning`, `<50` → `destructive`. Enforced in one place, `components/score-badge.tsx`, never
re-implemented per page.

## 3. Typography

System font stack (`--font-sans`, falling back through `ui-sans-serif`/`system-ui`) — no webfont is
loaded, keeping the design self-contained per the Artifact/CSP-style discipline this project favors
elsewhere (no external font CDN call). Scale is Tailwind's default (`text-xs` through `text-4xl`); pages
use `text-2xl font-semibold` for page titles (`<PageHeader>`), `text-lg font-semibold` for card titles,
`text-sm` for body copy, `text-xs text-muted-foreground` for meta/hint text. No custom type scale was
introduced — Tailwind's default already covers every size used.

## 4. Spacing

Tailwind's default 4px-based scale (`p-1` = 4px … `p-6` = 24px) is used throughout, unmodified. Page
content sits inside `<main className="container py-6">` (`container` is configured in
`tailwind.config.ts` with `center: true, padding: '1.5rem'`); cards use `p-6` (via `<CardHeader>`/
`<CardContent>`/`<CardFooter>`); form fields use `space-y-1.5`/`space-y-4` between label/input/error
groups. No spacing tokens beyond Tailwind's own were added — the existing scale was sufficient for every
layout in this phase.

## 5. Elevation

Four custom `boxShadow` utilities (`shadow-elevation-1` through `shadow-elevation-4`, `tailwind.config.ts`)
layer subtle to pronounced shadows: `elevation-1` for resting `<Card>`s, `elevation-2` for tooltips,
`elevation-3` for dropdown/select/popover content, `elevation-4` for dialogs/sheets. Named by elevation
level rather than Tailwind's default `shadow-sm`/`md`/`lg` naming so a page author picks by _role_
("this is a dialog, use elevation-4") rather than by guessing a shadow size.

## 6. Radius

One `--radius` CSS variable (`0.625rem`), with `rounded-lg`/`rounded-md`/`rounded-sm`/`rounded-xl` derived
from it in `tailwind.config.ts` (`calc(var(--radius) ± Npx)`) so every component's corners scale together
from one place if the brand radius ever changes.

## 7. Dark Mode

`next-themes` (`components/theme-provider.tsx`) with `attribute="class"`, `defaultTheme="system"`,
`enableSystem`. The root `<html>` in `app/layout.tsx` carries `suppressHydrationWarning` (the documented
next-themes requirement, since the theme class is applied client-side after first paint). `<ThemeToggle>`
(topbar) cycles light/dark; `/dashboard/settings` additionally exposes an explicit
light/dark/system three-way picker. No `prefers-color-scheme`-only fallback — `next-themes` handles
`system` by reading the OS preference once and reacting to `matchMedia` changes.

## 8. Component Inventory

See [component-library.md](component-library.md) for the full list with usage notes. Summary: Button,
Input, Textarea, Select, Checkbox, Label, Card (+Header/Title/Description/Content/Footer), Table (+Header/
Body/Row/Head/Cell/Caption), Badge, Alert (+Title/Description), Dialog (+Header/Footer/Title/Description),
Sheet (mobile nav drawer), Progress, Skeleton, Toast (`sonner`), Avatar, DropdownMenu, Separator, Tabs,
Tooltip — plus composite, app-specific components (EmptyState, ErrorState, ConfirmDialog, PageHeader,
StatCard, ScoreBadge, StatusBadge, PriorityBadge, ResumeVariantSelect).

## 9. Loading, Empty, and Error States

Every list/detail page follows the same three-state pattern, driven by React Query's `isLoading`/
`isError`/data-presence flags:

- **Loading** → `<Skeleton>` blocks shaped like the eventual content (never a spinner-only page).
- **Empty** → `<EmptyState icon title description action?>` — an icon, a one-line explanation, and
  (where applicable) a call-to-action button that opens the same "create" dialog the page's primary
  action button does.
- **Error** → `<ErrorState onRetry>` — a `refetch()` call wired to a "Tentar novamente" button, never a
  raw error dump.

## 10. Accessibility Conventions

- Every icon-only button carries `aria-label`.
- Every dialog/sheet has a `<DialogTitle>`/`<SheetTitle>` (screen-reader-only via `sr-only` where the
  visible header would be redundant, e.g. the mobile nav drawer).
- Form fields pair `<Label htmlFor>` with the input's `id`; validation errors render as
  `<p role="alert">` immediately after the field, driven by React Hook Form + Zod's `formState.errors`.
- The active sidebar link carries `aria-current="page"`.
- Focus rings (`focus-visible:ring-2 focus-visible:ring-ring`) are never removed, only restyled to match
  the theme.
