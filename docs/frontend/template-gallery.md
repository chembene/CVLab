# CVLab AI — Template Gallery & Live Preview (Frontend)

Status: implemented, Phase 11 (2026-08-05). The frontend half of the Template Engine — see [template-engine.md](../architecture/template-engine.md) for the backend catalog, theme-resolution algorithm, and rendering-pipeline rationale. This document covers the UI layer only: hooks, galleries, live preview, and the two selector pages, and how they fit [frontend-architecture.md](frontend-architecture.md)'s existing conventions.

## 1. Data layer (`lib/api/templates.ts`)

Follows the exact `useQuery`/`useMutation` + `apiFetch<T>()` convention every other `lib/api/*.ts` file in this codebase uses (envelope `{success, data}` / `{success:false, error}`, in-memory access token via `api-client.ts`). Ten hooks, mirrored for Resume and Cover Letter templates:

```
useResumeTemplates(filters?)              GET /templates/resume
useResumeTemplate(id)                     GET /templates/resume/:id
useFavoriteResumeTemplates()              GET /templates/resume/favorites
useRecentResumeTemplates()                GET /templates/resume/recent
useToggleResumeTemplateFavorite()         POST|DELETE /templates/resume/:id/favorite

useCoverLetterTemplates(filters?)         + the same 4 more, cover-letter/* paths
```

`TemplateFilters` (`category?`, `atsFriendly?`, `premium?`) serialize via a local `toQueryString()` helper — no shared query-string util exists yet, so each hook file that needs one writes its own small version rather than introducing a new cross-cutting dependency for four call sites.

`ResumeVariant`/`CoverLetter` (`lib/api/resume-variants.ts` / `lib/api/cover-letters.ts`) gained `templateId`/`themeOverrides` fields plus 3 mutation hooks each (`useSetResumeVariantTemplate`, `useUpdateResumeVariantTheme`, `useResetResumeVariantTheme`, mirrored for cover letters) — additive extensions, no existing hook signature changed.

## 2. Rendering primitives (`lib/template-engine/`, `components/template-engine/`)

Covered in depth in [template-engine.md](../architecture/template-engine.md) §10–12. Summary for frontend context:

- `lib/template-engine/theme.ts` — `resolveTheme()`, the 3-tier precedence chain (layout defaults < template row < user overrides).
- `components/template-engine/layouts/{ResumeLayout,CoverLetterLayout}.tsx` — the shared layout-arrangement components.
- `components/template-engine/renderers/` — the 9+1 shared content renderers, `SectionShell` primitives.

## 3. `TemplateSwatch` — data-driven preview thumbnails

No design-asset pipeline exists (`previewImage`/`thumbnail` are `null` in the seed data). `TemplateSwatch.tsx` instead renders a small, real `<svg>` directly from `layout`/`primaryColor`/`secondaryColor` — a header band vs. a circular-avatar header, a sidebar block if `layout` includes `sidebar`/`two-column-photo`, and a handful of placeholder content lines. It's not a designer-produced thumbnail, but it's always accurate (same 3 fields the real renderer reads) and needs no asset hosting. Used inside `TemplateCard`.

## 4. `TemplateCard`

One card = one template. Composes:

- `TemplateSwatch` (thumbnail, §3), clickable → `onPreview(id)`
- Name + category (`humanizeEnum(category)`)
- **ATS-friendly badge** (`success` variant) or a **"Foco visual"** badge (`outline`) when `isATSFriendly` is `false` — every template is labeled one way or the other, never silently omitted
- **Premium badge** (`warning` variant, crown icon) — only rendered when `template.premium`
- **Favorite toggle** (star icon, top-left) — `aria-pressed` reflects current state; the click handler is called with the _current_ (pre-toggle) `favorited` value, so the caller's mutation knows whether to `POST` or `DELETE`
- **Select button** — `"Selecionado"` (disabled-looking, `variant="default"`) when this card is the active selection, `"Usar este modelo"` (`variant="outline"`) otherwise

Structural note: the thumbnail button and the favorite-toggle button are **siblings**, not nested — an earlier draft nested a favorite `<button>` inside the thumbnail `<button>`, which is invalid HTML (browsers silently mis-parse nested interactive controls) even though React's direct-DOM-node creation doesn't error on it. Fixed before this phase shipped.

## 5. `TemplateGallery` — the shared shell (Part 7 & 8)

A presentational component (no data fetching of its own) — every list (`allTemplates`, `favoriteTemplates`, `recentTemplates`) and every callback (`onSelect`, `onPreview`, `onToggleFavorite`) is passed in as props. Renders:

- 3 tabs: **Todos** / **Favoritos** / **Usados recentemente**
- A category `Select`, computed from the distinct `category` values present in `allTemplates` — filters only the "Todos" tab's grid (favorites/recent are already small, curated lists that don't need re-filtering)
- A loading-skeleton grid (8 placeholder cards) while `isLoading`
- A caller-supplied `emptyLabel` for empty states (distinct wording for the Resume vs. Cover Letter gallery)

`ResumeTemplateGallery.tsx` / `CoverLetterTemplateGallery.tsx` are thin wrappers: each calls its own 4 hooks (§1) and threads the results into `TemplateGallery` — this is the concrete mechanism behind "Same experience. Separate gallery. Separate previews." (Part 8): the shell code is 100% shared, the _data_ never is.

## 6. `ThemeEditor` (Part 6)

A fully controlled form — `value: ThemeOverrides`, `onChange(next)`. Every field change calls `onChange({...value, [key]: newValue})` (a merge, never a replacement), so the parent page can hold theme edits as local state and feed them straight into `ResumePreview`'s `themeOverridesOverride` prop for instant live preview (§7) before anything is saved. Covers every Part 6 field: primary/secondary/accent color (native `<input type="color">`), font family (`Select`, 10 curated options), font size + line height (`<input type="number">`), section spacing + page margins + header style + divider style (`Select`s with named presets), icons-enabled + photo-enabled (`Checkbox`).

No dedicated slider/swatch-picker components exist in `components/ui/` — native inputs are a disclosed simplification, not a missing feature.

## 7. Live Preview (Part 5) — the override-prop pattern

`ResumePreview`/`CoverLetterPreview` each accept a **persisted** value and a **live override**:

```tsx
<ResumePreview
  content={variant.content}
  templateId={variant.templateId} // persisted
  templateIdOverride={pendingTemplateId} // unsaved, local state — wins if set
  themeOverrides={variant.themeOverrides}
  themeOverridesOverride={pendingTheme}
/>
```

`effectiveTemplateId = templateIdOverride ?? templateId ?? DEFAULT_*_TEMPLATE_ID` (`'ats-classic'` / `'cl-professional'` — always the safest, ATS-friendly choice). Every click in the gallery or edit in `ThemeEditor` updates local `useState`, which flows straight into the override props — the preview re-renders immediately, with **zero network request**, because `useResumeTemplate(effectiveTemplateId)` only re-fetches when the _template id itself_ changes, not on every theme tweak.

**Bug found and fixed by this phase's tests:** both preview components originally checked `if (isLoading || !template) return <Skeleton/>` _before_ checking `isError`. Since react-query's `data` (`template`) is also `undefined` when a query errors, a failed template fetch got stuck showing the loading skeleton forever instead of the error message. Fixed by checking `isError` first. See [template-engine.md](../architecture/template-engine.md) §16–17.

## 8. `ResponsivePreviewFrame` (Part 10)

A device-width toggle (`Desktop` 900px / `Tablet` 768px / `A4` 794px / `Print` 794px / `Mobile` 390px) wrapping whatever preview component is passed as `children`. Purely a width/scroll container — it renders no template-specific logic itself.

## 9. Selector pages

`app/dashboard/resume-variants/[id]/template/page.tsx` and `app/dashboard/cover-letters/[id]/template/page.tsx` — near-identical two-column layouts:

- **Left**: the gallery (`ResumeTemplateGallery`/`CoverLetterTemplateGallery`), selecting a template calls `useSetResumeVariantTemplate`/`useSetCoverLetterTemplate` immediately (a lightweight, instantly-persisted action — no separate "confirm" step, matching how template switching is described in the brief as "instant").
- **Right**: `ResponsivePreviewFrame` wrapping the live preview, plus `ThemeEditor` underneath. Theme edits are held in local state (`pendingTheme`) and only persisted when the user clicks **"Guardar personalização"** (`PUT .../theme`) — unlike template selection, theme edits are typically many small increments (a color, then a spacing tweak, then a font), so batching them into one explicit save avoids firing a request per keystroke.
- A **"Repor"** button calls `DELETE .../theme` directly (no local-state gating — reset is a single, obviously-intentional action).

Both existing detail pages (`resume-variants/[id]/page.tsx`, `cover-letters/[id]/page.tsx`) gained a **"Modelo e Aparência"** button (with a `Palette` icon) linking into the corresponding `/template` sub-route.

## 10. Testing

`apps/web/lib/template-engine/theme.test.ts` + 7 `apps/web/components/template-engine/**/*.test.tsx` files, 52 tests total. Notable jsdom-specific fixes discovered while writing these (documented inline in the test files, so future additions don't rediscover them the hard way):

- **Radix `Tabs` activates on `mouseDown`, not `click`** — `fireEvent.click()` alone never switches tabs in jsdom (no `onClick` handler on `Trigger`); use `fireEvent.mouseDown()`.
- **Radix `Select`'s listbox isn't reliably interactable in jsdom** without a pointer-capture polyfill this codebase doesn't have — category-filter _behavior_ is asserted at the plain-JS/rendering level instead of by driving the actual dropdown open.
- **`data-testid` beats `closest(text)` for scoping card assertions** — `humanizeEnum(category)` and a template's own `name` can collide (e.g. category `MODERN` → "Modern"), so `TemplateCard` exposes `data-testid="template-card-{id}"` rather than relying on text uniqueness.

## 11. Cross-references

- [template-engine.md](../architecture/template-engine.md) — backend catalog, theme resolution algorithm, rendering pipeline, database schema.
- [frontend-architecture.md](frontend-architecture.md) — the general hook/provider/routing conventions this module follows.
- [component-library.md](component-library.md) — the `Tabs`/`Select`/`Badge`/`Checkbox` primitives this module consumes.
