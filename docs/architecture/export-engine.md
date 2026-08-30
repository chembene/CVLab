# CVLab AI — Export Engine

Status: **implemented** (2026-08-20 → 2026-08-22). Generates a real, downloadable PDF or DOCX from a Resume Variant — the first feature in the platform that produces a binary file, and the first paid feature that is **not** AI. Audited before implementation (read-only audit report, "AUDITORIA — FASE Export Engine") and approved with an explicit architecture brief; this document reflects what was actually built.

## 1. Why this module exists

Users can build and tailor Resume Variants (Phase 3), pick a template and theme (Phase 11 Template Engine), and preview them live in the browser. What was missing was turning that preview into a file they can actually send to an employer. Export Engine closes that gap for PDF and DOCX, on demand, without duplicating a single line of the existing template/rendering logic.

## 2. Scope decisions (from the approved brief)

- **Resume export only**, PDF + DOCX, in this phase. Cover Letter and "Application Package" export are explicitly out of scope, but the module is shaped so `POST /exports/cover-letter` and `POST /exports/application-package` can be added later without a structural refactor (see §10).
- **No Cloudflare R2.** Nothing is persisted to object storage. A file is generated, streamed once in the HTTP response, and forgotten — `ExportedDocument` stores only the audit/idempotency record, never `storageKey`/`storageUrl`.
- **`Cv`/`CvVersion` are not reused.** Those two Phase-0 placeholder models are dormant (zero application-code references anywhere in the codebase) and are not part of the current source of truth. Export Engine has its own model, `ExportedDocument` (§4).
- **Not an AI feature.** No `AiOrchestrationService`, no `PromptRegistry`, no provider call, no AI-generated content. The exported content is exactly what is already stored in the Resume Variant / Resume Variant Version.

## 3. Architecture

```
ResumeVariant (or a specific ResumeVariantVersion)
        ↓
ExportService — ownership, version resolution, idempotency key, credits
        ↓
   ┌────┴────┐
   ▼         ▼
PdfResumeRenderer   DocxResumeRenderer
   │                    │
   ▼                    ▼
@cvlab/resume-renderer   `docx` library
(shared React layer)     (independent OOXML serializer)
   │                    │
   ▼                    ▼
Headless Chromium    docx.Packer
(puppeteer-core)          │
   │                    │
   ▼                    ▼
     PDF / DOCX Buffer
        ↓
ExportController — Content-Type / Content-Disposition / raw bytes
        ↓
   Browser download (nothing stored server-side)
```

### 3.1 `@cvlab/resume-renderer` — one rendering implementation, two consumers

The hardest constraint in the brief was **"Preview ≈ Export"** — the PDF must be produced by the _same_ template/theme rendering logic the live browser preview uses, not a second implementation. `apps/web`'s resume rendering layer (theme resolver, layouts, the 10 section renderer components, section-fields config) was already 100% pure React — no Tailwind classes, no `next/image`, no `'use client'` on the rendering components themselves (only the top-level `ResumePreview.tsx` wrapper has that directive). That made it possible to extract it, unchanged, into a new shared workspace package:

```
packages/resume-renderer/
  src/
    types.ts, theme.ts, profile.ts, format.ts, section-fields.ts
    renderers/  (SectionShell.tsx, index.tsx — 10 section renderers)
    layouts/    (ResumeLayout.tsx)
```

- **`apps/web`** consumes it via TS path mapping to the raw source (browser, live preview) — the 6 original files it used to own are now one-line re-export shims pointing at the package, so all 14 files that imported them keep working unchanged.
- **`apps/api`** consumes it via the compiled `dist/` output (`tsc`, same pattern as `packages/types`) through normal Node `require()` resolution.

`PdfResumeRenderer` renders `<ResumeLayout>` server-side with `react-dom/server`'s `renderToStaticMarkup()` (via `createElement()`, not JSX — `apps/api`'s tsconfig has no `jsx` option and was left untouched), producing the exact HTML string the browser would paint, then feeds that HTML into headless Chromium.

### 3.2 PDF rendering — headless Chromium, not PDFKit

`puppeteer-core` (not `puppeteer` — no bundled ~170MB Chromium download; this project reuses whatever Chrome/Edge is already installed) launches a real headless browser, calls `page.setContent(html)`, and prints with `page.pdf({ format: 'A4', printBackground: true })`. The executable path resolves in this order:

1. `PDF_CHROMIUM_PATH` environment variable (the supported production mechanism).
2. A short list of common local dev install paths (Windows/Linux Chrome/Edge), checked with `fs.existsSync` — dev-only convenience, never relied on in production.

If neither resolves, the renderer throws immediately (`No Chromium/Chrome/Edge executable found`) rather than hanging.

**Browser lifecycle**: every `render()` call launches its own browser instance and closes it in a `finally` block — including on a `page.pdf()`/`setContent()` failure — so no Chrome process is ever leaked on error. Verified both by unit tests (mocked Puppeteer, asserting `close()` is called exactly once on the failure path) and by real, repeated e2e runs against actual Chromium.

### 3.3 DOCX rendering — a genuinely separate serializer

DOCX generation uses the `docx` npm package (already a dependency) directly — never an HTML→DOCX or PDF→DOCX conversion, and never a second implementation of the visual templates. `DocxResumeRenderer` builds a `docx.Document` section-by-section (header, summary, work experience, education, skills, languages, certificates, projects, courses, awards, publications, volunteer experience, references), reusing `SECTION_CONFIGS`/`formatDate` from `@cvlab/resume-renderer` so titles/subtitles/date formatting stay consistent with the PDF and the live preview. It respects `template.supportedSections` exactly like the PDF/preview renderer — a section absent from the template is omitted entirely, never rendered as an empty placeholder.

Not pixel-perfect against the PDF by design (not a requirement) — the bar is: valid OOXML, opens cleanly in Word/LibreOffice, semantically correct, professional.

## 4. Database

Migration `20260812190944_export_engine` — additive only, no existing data touched, `Cv`/`CvVersion` untouched.

### `exported_documents`

| Column                        | Type                                                                | Notes                                                    |
| ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `id`                          | uuid PK                                                             |                                                          |
| `user_id`                     | uuid FK → `users`                                                   |                                                          |
| `resume_variant_id`           | uuid FK → `resume_variants`                                         |                                                          |
| `resume_variant_version_id`   | uuid FK → `resume_variant_versions`, nullable, `ON DELETE SET NULL` | Set only when a specific historical version was exported |
| `format`                      | `ExportFormat`                                                      | `PDF` \| `DOCX`                                          |
| `status`                      | `ExportStatus`, default `PENDING`                                   | `PENDING` → `SUCCESS` \| `FAILED`                        |
| `credits_charged`             | int, default 0                                                      | What was actually charged for this row                   |
| `credits_refunded`            | int, default 0                                                      | Set when a charge was later reversed (render failure)    |
| `idempotency_key`             | text, **unique**                                                    | Deterministic — see §6                                   |
| `failure_reason`              | text, nullable                                                      | Set only on `FAILED`                                     |
| `created_at` / `completed_at` | timestamps                                                          | `completed_at` set on both `SUCCESS` and `FAILED`        |

No `storage_key`/`storage_url` columns — per §2, nothing is persisted to object storage in this phase. This table is purely an audit/idempotency record, not a file store.

## 5. Versioning

An export either targets:

- **The Variant's current content** (`resumeVariantVersionId` omitted) — always the live `ResumeVariant.content`.
- **A specific historical version** (`resumeVariantVersionId` given) — resolved via `ResumeVersionRepository.findByIdWithinVariant(id, variantId, ownerUserId)`, which verifies in one query that the version (a) exists, (b) belongs to _this_ Resume Variant, and (c) is owned by the requesting user. Any mismatch is a 404 — never a silent fallback to the current content.

## 6. Idempotency

The key is deterministic — never `randomUUID()` — so an identical repeat request is recognized as the same export, not a new one:

```
export:resume:{userId}:{resumeVariantId}:{resolvedVersionNumber}:{format}
```

`resolvedVersionNumber` is the specific `ResumeVariantVersion.versionNumber` when one was pinned, or the Variant's current `version` otherwise — so re-exporting "current" after an edit (which bumps `version`) is correctly treated as a _new_ export, not a stale-cache collision.

`ExportRepository.upsertPending()` upserts on this key: a genuine first request creates a fresh `PENDING` row; an exact repeat resets the _same_ row back to `PENDING` (clearing `failureReason`/`completedAt`) rather than colliding with the unique constraint. The actual double-charge guard lives one layer up, in `CreditService.spend()`'s own idempotency handling — reused directly, not reimplemented here.

## 7. Credits

Not an AI feature, so credits are charged via `CreditService` directly — never `AiOrchestrationService`. `CreditsModule` exports `CreditService` for exactly this kind of reuse.

| Format | Feature key          | Cost       |
| ------ | -------------------- | ---------- |
| PDF    | `export_resume_pdf`  | 10 credits |
| DOCX   | `export_resume_docx` | 5 credits  |

`ExportService.exportResume()`:

1. Resolves content (§5) and computes the idempotency key (§6).
2. `creditService.estimate()` — if the balance is insufficient, the already-created `PENDING` record is immediately marked `FAILED` (0 charged, 0 refunded) and `InsufficientCreditsException` (409) is thrown — the record is never left dangling at `PENDING`.
3. `creditService.spendAndExecute()` charges the credits and runs the renderer as its `work()` callback. `spendAndExecute()`'s own behavior — refund automatically if `work()` throws — is what gives Export Engine refund-on-render-failure for free, with zero custom refund code.
4. On success: `markSuccess()` — `SUCCESS`, `creditsCharged` set.
5. On failure: `markFailed()` — `FAILED`, `creditsCharged` **and** `creditsRefunded` both set to the charged amount (the refund is total), `failureReason` set to the error message, then the error is rethrown.

**A price discrepancy exists between two documents and is deliberately not resolved here**: `prompts/11-credit-system.md` §3 lists "PDF premium export: 10 credits" (matches what was implemented) but is silent on DOCX; several _other_, already-shipped features have different numbers in `prompts/11-credit-system.md` vs. `docs/business/1.pricing-strategy.md.txt` (e.g. Cover Letter: 25 vs. the actually-implemented 40). This phase did not touch any of those existing prices — only added the two new Export Engine rows to `docs/business/1.pricing-strategy.md.txt`, using the values explicitly approved for this phase (PDF=10, DOCX=5).

## 8. Endpoint

```
POST /api/v1/exports/resume
Authorization: Bearer <accessToken>
{
  "resumeVariantId": "uuid",
  "resumeVariantVersionId": "uuid (optional)",
  "format": "PDF" | "DOCX"
}
```

Response: the raw file bytes, `Content-Type: application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `Content-Disposition: attachment; filename="curriculo.pdf"` (or `.docx`). Never JSON, never base64.

This is the **only binary-response endpoint in the API**. Every other controller's return value passes through the global `ResponseInterceptor`, which wraps it in the `{success,data}` JSON envelope — that would corrupt a PDF/DOCX buffer. `ExportController` uses `@Res() res: Response` **without** `{ passthrough: true }` (every other controller's `@Res()` use, e.g. `AuthController` for cookies, uses `passthrough: true`), which tells Nest to hand the response over entirely: the interceptor still runs but its output is never sent, since the controller calls `res.send()` itself. Thrown exceptions still go through the normal `AllExceptionsFilter` exactly as everywhere else, because nothing is written to `res` until generation has actually succeeded.

Rate-limited via a per-route `@Throttle({ limit: 10, ttl: 60_000 })` (stricter than the app-wide 100/60s default, given headless-Chromium rendering is materially heavier than a typical request) — the same `ThrottlerGuard` mechanism `AuthController` already uses for its own overrides; no new rate-limiting infrastructure.

## 9. Security

- `JwtAuthGuard` on every route.
- `assertOwnerOrAdmin` — the endpoint itself is self-service only (`targetUserId` is always the caller's own id, same pattern as `CoverLetterController`/`InterviewController` — no cross-user export path exists at the HTTP layer at all).
- Ownership is re-verified independently for the Resume Variant _and_ (when given) the Resume Variant Version — a version belonging to a different Variant, or to a different user, is a 404, never a silent fallback (IDOR-safe: existence is not leaked either way).
- Errors never leak stack traces or internal details — the existing `AllExceptionsFilter` handles this uniformly across the whole API, no special-casing needed here.
- No sensitive data logged; `AppLogger` calls in this module log ids and event types only.

## 10. Designed for, not built: Cover Letter / Application Package export

`EXPORT_FEATURE_KEY` is keyed by `ExportFormat`, not by document type, and `ExportService`/the renderer interfaces (`ResumeRenderInput`/`ResumeRenderer`) are already shaped generically enough that a future `POST /exports/cover-letter` could reuse the same idempotency/credits/lifecycle machinery with its own renderer implementations — no structural refactor anticipated. Not built in this phase, per the brief's explicit scope limit.

## 11. Limitations (current phase)

- No Cloudflare R2 — files are not retrievable after the HTTP response; a user must re-export to get the file again (which, per §6, may or may not be free depending on whether the underlying version/format combination already matches a still-charged export).
- No streaming — the whole file is buffered in memory before being sent (acceptable at résumé-document scale; would need revisiting for a hypothetical much larger export type).
- No Cover Letter / Application Package export yet (§10).
- DOCX is not pixel-perfect against the PDF (by design, not a defect).
- `docx-resume.renderer.ts` currently supports 12 fixed section types matching the existing Resume Variant content schema — no arbitrary custom sections.

## 12. Testing

- **Unit**: `export.repository.spec.ts`, `export.service.spec.ts` (ownership, current vs. historical vs. foreign-variant version resolution, PDF/DOCX routing, credit estimation, insufficient-credits lifecycle, deterministic idempotency key, SUCCESS/FAILED persistence), `pdf-resume.renderer.spec.ts` (Chromium launch/render/cleanup-on-error, dev-fallback path detection), `docx-resume.renderer.spec.ts` (valid OOXML buffer, template gating, empty-sections).
- **E2E** (`test/export-engine.e2e-spec.ts`, real Postgres/Redis/Chromium, no service mocks): auth, invalid format, missing variant, ownership/IDOR, cross-variant version, missing version, PDF happy path with real extracted PDF text + correct headers + credit charge, current-vs-historical version producing genuinely different files, DOCX happy path with real extracted DOCX text + credit charge, insufficient credits leaving a `FAILED` record without charging, a real (non-mocked) renderer failure — via a genuine `ResumeTemplate` row that exists but is `ARCHIVED` — producing a full refund and a `FAILED` record, and an identical repeat request not double-charging.
