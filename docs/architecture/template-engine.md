# CVLab AI — Resume & Cover Letter Template Engine

Status: **implemented, Phase 11** (2026-08-05). A generic, extensible, DB-backed rendering engine that powers Resume Preview and Cover Letter Preview today, and is built to power PDF Export, DOCX Export, Public Resume Sharing, and a Template Marketplace without further engine changes. Ships 10 built-in Resume Templates and 7 built-in Cover Letter Templates, live theme customization, and the frontend rendering pipeline (registry → layout → renderer → preview). Builds on [master-resume-data-model.md](master-resume-data-model.md) (Resume Variant content model) and [resume-version-history.md](resume-version-history.md) (`ResumeVariant.version` invariant) without modifying either — template/theme changes are a separate, additive concern.

## 1. Why this module exists

Per the brief: build a reusable rendering engine, not "a few templates" — one that keeps Resume/Cover Letter **data** completely independent from **presentation**, so presentation can never alter stored content, and so the same rendering pipeline can later grow into PDF/DOCX export and a template marketplace with zero rearchitecting. Before this phase, `ResumeVariant`/`CoverLetter` had no notion of a template at all — the frontend rendered raw content with no visual choice.

## 2. Module boundary (why `template-engine/` doesn't import `resume-variant/` or `cover-letter/`)

```
ResumeVariantModule   →  TemplateEngineModule   (one direction only)
CoverLetterModule     →  TemplateEngineModule   (one direction only)
TemplateEngineModule  ✗  ResumeVariantModule / CoverLetterModule
```

`TemplateEngineModule` is a **leaf module** — the same pattern [resume-version-history.md](resume-version-history.md) §2 established for `ResumeVersionModule`. It exposes `ResumeTemplateRepository`, `CoverLetterTemplateRepository`, and their favorite-repository counterparts; `ResumeVariantService`/`CoverLetterService` inject `ResumeTemplateRepository`/`CoverLetterTemplateRepository` to validate a `templateId` before saving it, but `TemplateEngineService` never calls back into either variant module. This keeps the catalog reusable by any future consumer (PDF export, marketplace admin tools) without ever risking a circular dependency.

## 3. Why rendering lives in the frontend, not the backend

The backend's job (Part 13) is **catalog + preferences**: template metadata, favorites, recently-used, and the `templateId`/`themeOverrides` columns on `ResumeVariant`/`CoverLetter`. It never produces HTML, CSS, or any rendered output. Actual rendering — theme resolution, layout arrangement, the 9+1 renderer components — is pure frontend TypeScript/React (`apps/web/lib/template-engine/`, `apps/web/components/template-engine/`). Reasons:

- **Live Preview (Part 5)** must update instantly on every keystroke/color pick with zero network round-trip — a backend-rendered preview would need a request per change.
- **A future PDF/DOCX export** will want to reuse this exact rendering logic client-side (e.g. via a headless-browser print pipeline) or server-side without duplicating a second renderer — keeping the renderer pure, dependency-light TypeScript (no NestJS, no Prisma) means it's portable to either target later.
- Presentation never touches stored content either way — the backend enforces that by using plain-field updates, never `applyEdit()` (§8).

## 4. Database

Migration `20260805120318_template_engine_theme_and_favorites`. Full row shapes in [database-overview.md](database-overview.md).

- **`ResumeTemplate`** / **`CoverLetterTemplate`** — the catalog. `id`, `name`, `category` (enum), `previewImage`/`thumbnail` (nullable — no design-asset pipeline exists yet, see §11), `isATSFriendly`, `premium`, `version`, `primaryColor`, `secondaryColor`, `font`, `layout` (open string key, not a closed enum — "the brief didn't specify a closed set"), `supportedSections` (`String[]`), `status` (`ACTIVE | DRAFT | ARCHIVED`).
- **`ResumeTemplateCategory`** enum (11 values: `ATS_CLASSIC, MODERN, EXECUTIVE, MINIMAL, CREATIVE, DEVELOPER, FINANCE, MARKETING, HEALTHCARE, ACADEMIC, EUROPASS`) and **`CoverLetterTemplateCategory`** (7 values: `PROFESSIONAL, EXECUTIVE, MODERN, CORPORATE, CREATIVE, MINIMAL, ACADEMIC`) — both pre-existed this phase (scaffolded during an earlier Phase 10.5 schema-design pass) and were **not modified**, per "don't modify completed phases unless a genuine bug is found."
- **`ResumeVariant.templateId`** / **`CoverLetter.templateId`** — nullable FK into the matching catalog table. `null` means "render with the safe ATS-friendly default" (`ats-classic` / `cl-professional`), resolved client-side, not persisted as a default row.
- **`ResumeVariant.themeOverrides`** / **`CoverLetter.themeOverrides`** — nullable `Json?`, Part 6's per-document color/font/spacing customization. Independent of `content` — never read or written by any content-editing code path.
- **`ResumeTemplateFavorite`** / **`CoverLetterTemplateFavorite`** — one row per `(userId, templateId)`, unique-constrained. Two parallel typed tables rather than one polymorphic `templateId`+`templateType` table, matching this codebase's established convention (e.g. `Application`'s separate `resumeVariantId`/`jobTargetId` columns) over a loosely-typed generic reference.
- **"Recently used" is not a table.** It's derived at query time via `distinct: ['templateId']` + `orderBy: {updatedAt: 'desc'}` on `resumeVariant`/`coverLetter` — avoiding a redundant "last touched" copy that could drift from the real `templateId` column.

### 4.1 Category best-fit mapping (disclosed, not a schema change)

The brief names 10 Resume Template titles and 7 Cover Letter titles; the pre-existing enums don't have an exact 1:1 value for every title. Mapped in the seed data (`apps/api/src/template-engine/seed/*.seed.ts`) as:

| Resume Template | Category used | Cover Letter Template | Category used                          |
| --------------- | ------------- | --------------------- | -------------------------------------- |
| Modern          | `MODERN`      | Professional          | `PROFESSIONAL`                         |
| Professional    | `FINANCE`     | Executive             | `EXECUTIVE`                            |
| Executive       | `EXECUTIVE`   | Modern                | `MODERN`                               |
| Minimal         | `MINIMAL`     | Corporate             | `CORPORATE`                            |
| ATS Classic     | `ATS_CLASSIC` | Government            | `ACADEMIC` (both formal/institutional) |
| Technology      | `DEVELOPER`   | Minimal               | `MINIMAL`                              |
| Creative        | `CREATIVE`    | Startup               | `CREATIVE` (energetic, informal)       |
| Elegant         | `MARKETING`   |                       |                                        |
| Corporate       | `EUROPASS`    |                       |                                        |
| Academic        | `ACADEMIC`    |                       |                                        |

`HEALTHCARE` is deliberately left unused — reserved headroom proving a future 11th resume template needs zero enum/engine change, only a new catalog row.

## 5. Backend module

`apps/api/src/template-engine/`:

```
resume-template.repository.ts            Prisma access — findAll(filters) / findById / findRecentlyUsedByUserId
cover-letter-template.repository.ts       Same shape, CoverLetterTemplate
resume-template-favorite.repository.ts    add / remove / findAllTemplatesByUserId
cover-letter-template-favorite.repository.ts  Same shape
template-engine.service.ts                Catalog read + owner-scoped favorites (§6)
template-engine.controller.ts             /api/v1/templates/* (§7)
template-engine.module.ts                 Exports all 4 repositories + the service
dto/list-resume-templates-query.dto.ts    ?category / ?atsFriendly / ?premium filters
dto/list-cover-letter-templates-query.dto.ts
dto/theme-overrides.dto.ts                Shared by both ResumeVariant and CoverLetter PUT .../theme
seed/resume-templates.seed.ts             RESUME_TEMPLATE_SEED — single source of truth, §9
seed/cover-letter-templates.seed.ts       COVER_LETTER_TEMPLATE_SEED
```

`apps/api/src/resume-variant/` and `apps/api/src/cover-letter/` additions (additive only — no existing method signature changed):

```
{resume-variant,cover-letter}.service.ts   +setTemplate() / updateTheme() / resetTheme() (§8)
dto/set-template.dto.ts                    PUT .../template body: { templateId }
```

## 6. `TemplateEngineService`

Two responsibilities only:

- **Catalog reads** (`listResumeTemplates`/`getResumeTemplate` + Cover Letter equivalents) — no ownership check; the catalog is a shared, read-only resource every authenticated user sees identically.
- **Owner-scoped favorites/recently-used** — every method calls `assertOwnerOrAdmin(requestingUser, targetUserId)` first, the same shared utility every controller in this codebase uses since Phase 2A. `favoriteResumeTemplate()` re-validates the template exists (via `getResumeTemplate()`) before writing the favorite row, so a stale/typo'd `templateId` fails with a 404 rather than silently creating an orphaned favorite.

## 7. Endpoints

On `TemplateEngineController` (`/api/v1/templates`), all behind `JwtAuthGuard`:

| Method & path                                                                                                                            | Notes                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /resume`                                                                                                                            | Catalog list, `?category`/`?atsFriendly`/`?premium` filters        |
| `GET /resume/favorites`                                                                                                                  | Current user's favorited Resume Templates                          |
| `GET /resume/recent`                                                                                                                     | Current user's 5 most-recently-used Resume Templates (derived, §4) |
| `GET /resume/:id`                                                                                                                        | Single template detail                                             |
| `POST /resume/:id/favorite`                                                                                                              | Add favorite → `{ favorited: true }`                               |
| `DELETE /resume/:id/favorite`                                                                                                            | Remove favorite → `{ favorited: false }`                           |
| `GET /cover-letter`, `/cover-letter/favorites`, `/cover-letter/recent`, `/cover-letter/:id`, `POST` `/DELETE /cover-letter/:id/favorite` | Exact mirror, Cover Letter Templates                               |

On `ResumeVariantController` (`/api/v1/resume-variants`) and `CoverLetterController` (`/api/v1/cover-letters`), 3 new routes each:

| Method & path      | Notes                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `PUT :id/template` | Body `{ templateId }`. Validates the template exists, then a plain-field update (§8)       |
| `PUT :id/theme`    | Body: `ThemeOverridesDto` (Part 6 fields, §10). Wholesale-replaces stored `themeOverrides` |
| `DELETE :id/theme` | Clears `themeOverrides` back to `null` — the template's own defaults then apply            |

## 8. Presentation vs. content — the core invariant

**`setTemplate()`, `updateTheme()`, and `resetTheme()` never call `applyEdit()`.** They go through the repository's plain `update()` method — the exact same distinction [resume-version-history.md](resume-version-history.md) §3 draws between content-mutating and non-content-mutating writes, except here the answer is simpler: template/theme changes are **never** content-mutating, full stop.

Concretely, on both `ResumeVariantService` and `CoverLetterService`:

```ts
async setTemplate(user, userId, id, templateId) {
  await assertOwnerOrAdmin(...);
  await this.templateRepository.findByIdUnfiltered(templateId) ?? throw NotFoundException;
  return this.repository.update(id, { templateId });   // plain update — no version bump
}
```

Consequences, verified directly in both unit and e2e tests:

- `ResumeVariant.version` / `CoverLetter.version` **never increments** from a template/theme change.
- No `ResumeVariantVersion` row is ever written by this code path — the version-history timeline stays exactly what the content-editing paths produced.
- `content` is byte-identical before and after.

Clearing `themeOverrides` back to SQL `NULL` (not the JSON literal `null`) required switching `resume-variant.service.ts` and `cover-letter.service.ts` from `import type { Prisma }` to a real value import, so `resetTheme()` can pass Prisma's `Prisma.DbNull` sentinel — `Prisma.JsonNull` would instead store the literal JSON value `null` inside the column, which is a different, wrong thing.

## 9. Built-in templates

**10 Resume Templates** (`apps/api/src/template-engine/seed/resume-templates.seed.ts`): Modern, Professional, Executive, Minimal, ATS Classic, Technology, Creative, Elegant, Corporate, Academic — spanning 5 layout keys (`single-column`, `sidebar-left`, `sidebar-right`, `header-band`, `two-column-photo`). Every field a template defines is **layout/typography/colors/spacing/icons/header/sidebar only** — never resume content.

**7 Cover Letter Templates** (`cover-letter-templates.seed.ts`): Professional, Executive, Modern, Corporate, Government, Minimal, Startup — spanning 4 layout keys (`letter-classic`, `letter-header-band`, `letter-modern`, `letter-minimal`), reusing the exact same rendering engine as Resume Templates (§3, §12).

Both seed files are the **single source of truth** — `prisma/seed-templates.ts` (idempotent `upsert`, keyed on the stable slug `id`s like `'modern'`/`'cl-professional'`) and every e2e test that needs templates to exist both import from these exact arrays, so the DB rows, the fixtures, and this documentation can never quietly drift apart. Run via:

```bash
npm run db:seed:templates
```

## 10. Theme resolution (Part 6, Part 11)

`apps/web/lib/template-engine/theme.ts`'s `resolveTheme(template, overrides)` is the **one place** layout/typography/spacing/header defaults are centralized (Part 11: "avoid hardcoded values" — no renderer or layout component invents its own magic number). Three layers, lowest to highest priority:

1. **`LAYOUT_DEFAULTS[template.layout]`** — sensible defaults per layout key (header style, divider style, section spacing, icon/photo support).
2. **`template.primaryColor` / `.secondaryColor` / `.font`** — the catalog row's own branding.
3. **`themeOverrides`** (Part 6, user-chosen, per Resume Variant / Cover Letter) — always wins.

```ts
fontFamily: o.fontFamily ?? template.font ?? defaults.typography?.fontFamily ?? BASE_TYPOGRAPHY.fontFamily,
```

Every `ResolvedTheme` field follows this same `override ?? template ?? layoutDefault ?? hardFallback` chain. `ThemeOverrides` (the Part 6 field list) covers: primary/secondary/accent color, font family/size, line height, section spacing, page margins, header style, divider style, icons enabled, photo enabled.

An unrecognized `layout` string (e.g. a future template that ships before its layout key is registered) falls back to `LAYOUT_DEFAULTS['single-column']` rather than throwing — a deliberately soft failure mode.

## 11. Frontend rendering pipeline

```
TemplateMetadata (from GET /templates/...)
        │
        ▼
resolveTheme(template, themeOverrides) → ResolvedTheme      (§10)
        │
        ▼
ResumeLayout / CoverLetterLayout (theme.layout.key selects one of 5 / 4 arrangements)
        │
        ▼
9+1 shared renderer components (HeaderRenderer, ExperienceRenderer, ...)  (§12)
        │
        ▼
ResumePreview / CoverLetterPreview  →  ResponsivePreviewFrame  (§13)
```

- **`apps/web/lib/template-engine/types.ts`** — `TemplateTypography`, `TemplateSpacing`, `TemplateColors`, `TemplateHeader`, `TemplateSidebar`, `TemplateLayout`, `ResolvedTheme` (Part 11's named config objects).
- **`apps/web/lib/template-engine/theme.ts`** — `resolveTheme()`, `LAYOUT_DEFAULTS`, `SPACING_PX`/`MARGIN_PX` (named-preset → real CSS px, the one place these are defined).
- **`apps/web/components/template-engine/layouts/ResumeLayout.tsx`** — **one component, 5 arrangements**, keyed by `theme.layout.key`. Adding an 11th Resume Template that reuses one of the 5 existing layout keys requires **zero changes here** — Part 1's "future templates require zero engine changes", genuinely satisfied rather than asserted.
- **`.../layouts/CoverLetterLayout.tsx`** — same principle, 4 arrangements, reuses `HeaderRenderer`.

No `previewImage`/`thumbnail` design-asset pipeline exists yet — both fields are seeded `null`. The gallery instead renders a live, inline-SVG `TemplateSwatch` generated directly from `layout`/`primaryColor`/`secondaryColor` (§14), so every card always shows an accurate, up-to-date miniature without a static-asset dependency.

## 12. Rendering Layer — the 9+1 shared renderers (Part 9)

`apps/web/components/template-engine/renderers/index.tsx` — every renderer takes `(data, theme)` only and is shared, unmodified, across every template. Templates never define their own markup for these; they only choose a `layout` key and colors/fonts.

| Renderer                        | Section                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HeaderRenderer`                | Name, headline/title, contact row (email/phone/city/linkedin/github/website), optional photo                                                                                                      |
| `SummaryRenderer`               | Professional summary                                                                                                                                                                              |
| `ExperienceRenderer`            | Work experience                                                                                                                                                                                   |
| `EducationRenderer`             | Education                                                                                                                                                                                         |
| `SkillsRenderer`                | Skills (pill layout)                                                                                                                                                                              |
| `LanguagesRenderer`             | Languages + proficiency                                                                                                                                                                           |
| `ProjectsRenderer`              | Projects                                                                                                                                                                                          |
| `CertificationRenderer`         | Certificates                                                                                                                                                                                      |
| `ReferenceRenderer`             | References                                                                                                                                                                                        |
| `ListSectionRenderer` _(added)_ | Generic — courses / awards / publications / volunteer experiences: the 4 array sections not individually named in the brief's list, covered here rather than silently dropped from every template |

`SectionShell`/`ItemTitle`/`ItemSubtitle`/`ItemDates` (`renderers/SectionShell.tsx`) are the shared primitives every named renderer above is built on — themed heading, themed spacing, consistent item structure. Field-name knowledge (which field is the "title" vs "subtitle" for a given section type) is **reused, not duplicated**, from `apps/web/lib/section-fields.ts`'s pre-existing `SECTION_CONFIGS` (originally built for the Master Resume section editor).

Styling is inline `CSSProperties` computed from `ResolvedTheme` — no CSS-in-JS library, no Tailwind classes on the actual resume/letter markup, since this output must stay portable to a future PDF/DOCX export pipeline (§3).

## 13. Live Preview & Responsive Preview (Part 5, Part 10)

**Live-preview-via-override-props**: `ResumePreview`/`CoverLetterPreview` accept both a persisted value and a live, unsaved override —

```ts
templateId?: string | null;        // persisted (ResumeVariant.templateId)
templateIdOverride?: string;       // live, unsaved selection — wins if set
themeOverrides?: ThemeOverrides | null;
themeOverridesOverride?: ThemeOverrides;
```

`effectiveTemplateId = templateIdOverride ?? templateId ?? DEFAULT_*_TEMPLATE_ID` — the gallery/theme-editor pages (§15) hold the in-progress selection in local component state and pass it as the override, so every click/keystroke re-renders the preview instantly with zero network round-trip for the edit itself (only the _save_ action calls the API).

**`ResponsivePreviewFrame`** (Part 10): Desktop (900px) / Tablet (768px) / A4 (794px ≈ 210mm@96dpi) / Print (same width as A4) / Mobile (390px) toggle, wrapping whatever preview is passed as `children`. "Print preview" here means "what the A4 page looks like" — no actual print-driver/PDF engine exists yet (that's Export Engine, a separate future phase per the roadmap).

## 14. Template Selector galleries (Part 7, Part 8)

`apps/web/components/template-engine/`:

```
TemplateSwatch.tsx              Live inline-SVG miniature (layout + colors), §11
TemplateCard.tsx                Swatch + name + category + ATS/Premium badges + favorite toggle + select
TemplateGallery.tsx             Shared shell: Todos/Favoritos/Usados-recentemente tabs + category filter
ResumeTemplateGallery.tsx       Thin wrapper — wires the 4 resume-template hooks into TemplateGallery
CoverLetterTemplateGallery.tsx  Thin wrapper — wires the 4 cover-letter-template hooks (separate data source)
ThemeEditor.tsx                 Part 6 controlled form — every field an onChange, no direct API calls
```

"Same experience. Separate gallery. Separate previews." (Part 8) is satisfied by `ResumeTemplateGallery`/`CoverLetterTemplateGallery` each fetching their own independent template list and passing it into the same shared `TemplateGallery` shell — the shell itself never reaches into a shared data source.

Selector pages: `app/dashboard/resume-variants/[id]/template/page.tsx` and `app/dashboard/cover-letters/[id]/template/page.tsx` — each combines a gallery (left), a live `ResponsivePreviewFrame`-wrapped preview + `ThemeEditor` (right), holding the in-progress template/theme choice in local state (§13) until the user explicitly saves via the `PUT .../template` / `PUT .../theme` hooks. Linked from each document's detail page via a "Modelo e Aparência" button.

No dedicated color-picker/slider UI primitives exist in `components/ui/` yet — `ThemeEditor` uses native `<input type="color">` and `<input type="number">`, a disclosed simplification rather than building new design-system primitives out of scope for this phase.

## 15. Ownership & permissions

Every template/theme mutation on `ResumeVariantController`/`CoverLetterController` goes through the same `assertOwnerOrAdmin()` check every other mutating method on those controllers already uses — no new permission model introduced. Favorites/recently-used on `TemplateEngineController` follow the identical self-service (`user.id` is always both requester and target) + admin-bypass-at-service-layer pattern.

## 16. Testing

- **Backend unit** (`apps/api/src/template-engine/**/*.spec.ts` + extensions to `resume-variant`/`cover-letter` specs): all 4 repositories, `TemplateEngineService`, `TemplateEngineController`; `setTemplate()`/`updateTheme()`/`resetTheme()` on both variant services — including an explicit assertion that `applyEdit()` is never called (§8).
- **Backend e2e** (`apps/api/test/template-engine.e2e-spec.ts`, 22 tests, real Postgres/Redis): catalog list/filter/get for both template types; favorite add/remove/idempotency; recently-used derivation; the 6 new `PUT`/`DELETE` routes on both `ResumeVariantController`/`CoverLetterController`, asserting `version`/`content` are unchanged after every template/theme mutation; cross-user isolation; 404s for a bad `templateId`.
- **Frontend unit/component** (`apps/web/lib/template-engine/theme.test.ts`, `apps/web/components/template-engine/**/*.test.tsx`, 52 tests): `resolveTheme()`'s full 3-tier precedence including the unknown-layout fallback and the `lineHeightPercent`→ratio conversion; all 10 named renderers' conditional-empty-state and field-mapping behavior; `TemplateCard`/`TemplateGallery` selection, favoriting, and tab/category filtering; `ThemeEditor`'s merge-not-replace `onChange` contract; `ResumePreview`/`CoverLetterPreview`'s override-precedence (Part 5) and error-state rendering.
- **A real bug caught by this phase's own tests**: `ResumePreview`/`CoverLetterPreview`'s original loading guard was `if (isLoading || !template) return <Skeleton/>` checked _before_ the `isError` branch — since `template` (react-query's `data`) is also `undefined` on a fetch error, the component got permanently stuck showing a loading skeleton instead of the error message on any template-fetch failure. Fixed by checking `isError` first; see §17.

## 17. Known limitations (disclosed, not fixed this phase)

- **No design-asset pipeline** — `previewImage`/`thumbnail` are seeded `null`; the gallery's `TemplateSwatch` is a generated-from-data stand-in, not a designer-produced image. Revisit once the product wants pixel-perfect marketing thumbnails.
- **No color-picker/slider primitives** — `ThemeEditor` uses native HTML inputs; a future design-system pass could replace these with a richer swatch picker.
- **Diff/version history untouched by design** — template/theme changes never appear in the Resume Version History timeline ([resume-version-history.md](resume-version-history.md)), since they're not content changes. If the product later wants an audit trail of _appearance_ changes too, that would be a new, separate log — not a repurposing of `ResumeVariantVersion`.
- **No PDF/DOCX export yet** — the rendering pipeline (§3, §11–12) is deliberately built export-portable, but the export pipeline itself is a separate future phase (see [roadmap.md](../development/roadmap.md)).
- **Marketplace fields not yet added** — `authorId`, `source` (Official/Community/Premium/Downloaded), and per-template versioning beyond the existing `version: Int` counter are not in this phase's schema. The catalog-as-DB-rows architecture (§1, §4) was chosen specifically so those columns can be added later without touching the rendering engine at all.

## 18. Dependency Diagram

```
ResumeVariantModule → TemplateEngineModule     (one direction only — §2)
CoverLetterModule   → TemplateEngineModule     (one direction only — §2)

Never: TemplateEngineModule → ResumeVariantModule
Never: TemplateEngineModule → CoverLetterModule
```
