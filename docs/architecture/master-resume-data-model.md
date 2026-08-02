# CVLab AI — Master Resume Data Model

Status: implemented (Phase 2A, migration `20260801181845_resume_engine_foundation`). Records and
supersedes the relevant parts of [cv-data-model.md](cv-data-model.md) and the `profiles` /
`cvs` / `cv_versions` rows in [database-overview.md](database-overview.md) — see §5 "Reconciliation
with cv-data-model.md" below.

## 1. Core Concept

The platform does not revolve around CVs. It revolves around a **Master Resume**: each user owns
exactly one, and it is the single source of truth for their professional information. Future CVs
(Phase 5+) are **filtered, templated views** generated from the Master Resume — never a second
place where the user re-enters or duplicates experience, education, skills, etc.

```
Profile (personal info)  ─┐
                           ├─▶  Master Resume  ─▶  (future) CV Versions = filtered snapshots
11 Resume Sections        ─┘
```

## 2. Entities

### `Profile`

Personal/contact information — one row per user, `user_id` unique. Redesigned in Phase 2A from
Phase 0's generic `content: Json?` placeholder into explicit relational columns, because the field
set is now known and fixed (no longer a speculative future shape):

| Field                                                                     | Notes                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `id`, `user_id` (unique FK → `users`)                                     |                                                                      |
| `first_name`, `last_name`, `display_name`, `headline`                     |                                                                      |
| `phone`, `email`, `country`, `city`, `address`, `birth_date` (`@db.Date`) |                                                                      |
| `linkedin`, `github`, `portfolio`, `website`, `photo_url`, `bio`          |                                                                      |
| `created_at` / `updated_at` / `deleted_at`                                | soft-deleted, per §3 of [database-overview.md](database-overview.md) |

`PUT /api/v1/profile` upserts (creates on first save, replaces thereafter) — there is no separate
create endpoint, since a profile with all-null fields is a valid initial state.

### `MasterResume`

The professional-summary/settings record. Exactly one per user (`user_id` unique, enforced at the
DB level), created explicitly via `POST /api/v1/resume` (not auto-created on registration, so a
user can complete their profile without being forced into resume-building immediately).

| Field                                                                                  | Notes                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `user_id` (unique FK → `users`)                                                  |                                                                                                                                                                                                                                              |
| `title`, `summary`, `career_level`, `years_experience`                                 |                                                                                                                                                                                                                                              |
| `desired_position`, `desired_salary` (`@db.Decimal(12,2)`), `currency` (default `MZN`) |                                                                                                                                                                                                                                              |
| `visibility` (default `PRIVATE`), `status` (default `DRAFT`)                           | open strings, not enums — no closed value set was specified; validated only as strings with a max length. A future phase can tighten these to a real enum once the values are decided, which is a non-breaking migration (widen-then-narrow) |
| `completion_percentage` (default `0`)                                                  | **server-computed only** — never accepted from the client (see §4)                                                                                                                                                                           |
| `created_at` / `updated_at` / `deleted_at`                                             | soft-deleted                                                                                                                                                                                                                                 |

### 11 Resume Sections

`WorkExperience`, `Education`, `Skill`, `Language`, `Certificate`, `Project`, `Course`, `Award`,
`Publication`, `VolunteerExperience`, `Reference` — each `N—1 MasterResume` via `resume_id`, and
each sharing an identical structural shape:

- `id`, `resume_id` (FK → `master_resumes`)
- `display_order` (int, default `0`) — controls presentation order; reassigned via the section's
  `reorder` endpoint, never inferred from `created_at`
- `created_at` / `updated_at` / `deleted_at` — soft-deleted
- section-specific fields (see `apps/api/src/resume-sections/dto/*.dto.ts` for the authoritative,
  per-field-validated list — not duplicated here to avoid the two going out of sync)

Two sections enforce a duplicate-prevention rule at the service layer, per the approved business
rule ("no duplicate skills/certificates/education"): `Skill` (unique `name`, case-insensitive,
among a resume's active rows), `Certificate` (unique `(title, issuer)`), `Education` (unique
`(institution, degree)`). The other eight have no such constraint — e.g. two roles at the same
company is valid work experience, not a duplicate.

## 3. Why One Generic Engine, Not 11 Tables' Worth of Duplicated Code

All 11 section types share identical CRUD, authorization (owner-or-admin), soft-delete, reordering,
and side-effect (history event + completion recalculation) behavior — only the field list and two
optional rules (duplicate check, date-field normalization) differ per type. Rather than 11
near-identical repository/service/controller classes, the backend implements **one** generic
`ResumeSectionsRepository` / `ResumeSectionsService`, driven by a
`SECTION_DEFINITIONS: Record<SectionType, SectionDefinition>` registry
(`apps/api/src/resume-sections/section-registry.ts`) that maps each section type to its Prisma
delegate name, history `entityType` label, optional `duplicateCheckFields`, and optional
`dateFields`. Only the DTOs (`dto/*.dto.ts`) and the thin per-type controllers
(`controllers/*.controller.ts`, one line of business logic each — delegate to the generic service)
are type-specific, because that's the boundary where per-field validation genuinely differs.

The frontend mirrors this with its own `SECTION_CONFIGS` registry
(`apps/web/lib/section-fields.ts`) driving a single `SectionManager` component
(`apps/web/components/section-manager.tsx`), instead of 11 near-duplicate page components.

## 4. Completion Percentage

`ResumeCompletionService.recalculate(userId)` runs after every profile/resume/section mutation
(via the domain-event listener pattern in §5 of this doc's sibling,
[system-architecture.md](system-architecture.md) §4) and writes the result to
`MasterResume.completion_percentage`. It is a simple boolean-checklist average, not a weighted
model — the brief specified example contributing factors, not a formula, so the simplest correct
implementation was chosen:

```
checks = [
  profile.firstName && profile.lastName,   // Personal Info
  workExperienceCount > 0,                 // Experience
  educationCount > 0,                      // Education
  skillCount > 0,                          // Skills
  languageCount > 0,                       // Languages
  profile.photoUrl,                        // Photo
  resume.summary,                          // Summary
  profile.linkedin,                        // LinkedIn
  profile.portfolio,                       // Portfolio
]
percentage = round(checks.filter(true).length / checks.length * 100)
```

Because it is always server-recalculated from current data (never incrementally patched), it
cannot drift out of sync with the underlying rows — the same class of correctness argument used for
`test_sessions`' derived "best attempt" in [database-overview.md](database-overview.md) §2.

## 5. Reconciliation with `cv-data-model.md`

[cv-data-model.md](cv-data-model.md) describes the Phase 0 `CV`/`CVVersion` JSONB model, written
before the Master Resume concept existed. That model is **not implemented and not wired into any
module as of Phase 2A** — the `Cv`/`CvVersion` Prisma tables exist (Phase 0 schema) but nothing
reads or writes them yet. Reconciliation:

- **Master Resume is the source of truth** for all professional data going forward. It is not
  replaced by or merged into `CV`/`CVVersion` — it sits **above** them in the data flow.
- **`CV`/`CVVersion` remains the future export/versioning model**, scoped for the phase that adds
  ATS-targeted exports and job-target filtering (the "Export Engine" explicitly excluded from
  Phase 2A). When that phase is implemented, `CVVersion.content` (JSONB) will be populated by
  **filtering and snapshotting the Master Resume's sections** at generation time — e.g. selecting a
  subset of `WorkExperience`/`Skill` rows relevant to a target job — not by the user re-entering
  data into a second editor.
- Until that phase exists, `cvs` and `cv_versions` stay present in the schema but dormant (no
  controller/service touches them). This is intentional forward preparation, not dead code to be
  removed — removing them now would just require re-adding the same tables later.
- `docs/architecture/database-overview.md`'s `profiles` row (JSONB-shaped, "may follow the same
  structured-JSON approach as CVs") is superseded by §2 of this document — `Profile` is now a
  relational table with explicit columns, decided once the concrete field list was known.

## 6. Authorization

Every Profile/MasterResume/Section endpoint requires a valid JWT (`JwtAuthGuard`) and enforces
owner-or-admin via `assertOwnerOrAdmin()` (`apps/api/src/common/authorization/assert-owner-or-admin.util.ts`)
— a regular `USER` may only read/write their own data; `ADMIN`/`SUPER_ADMIN` bypass the ownership
check but still go through the same service methods (no direct repository access), consistent with
the Admin boundary rule in [module-boundaries.md](module-boundaries.md) §2.

## 7. History & Domain Events

Every create/update/delete across Profile, MasterResume, and all 11 sections emits a generic
`ResumeEntityChangedEvent(userId, entityType, entityId, action)` via `@nestjs/event-emitter`,
consumed by `HistoryListener` to write one `history_events` row per mutation
(`event_type = "${entityType}_${action}"`, e.g. `"work_experience_created"`). This is the same
domain-events pattern documented in [system-architecture.md](system-architecture.md) §4, applied
for the first time by real (non-auth) business logic.

## 8. Job Target Engine (Phase 2B)

Extends the flow this document opens with:

```
Profile + Master Resume  →  Job Target  →  Resume Variant  →  AI Optimization (future)  →  Application Tracking
```

(Resume Variant is implemented as of Phase 3 — see §9.)

A **Job Target** (`job_targets`) is a specific job opportunity the user is preparing for — title,
company, location, employment type, seniority, salary range, currency, an optional job URL and
pasted job description, source, status (`DRAFT`/`READY`/`ARCHIVED`), and notes. It has three small
child collections — `job_target_keywords`, `job_target_skills`, `job_target_languages` — each
**replaced wholesale on write** (delete-then-recreate in one transaction) rather than diffed,
because they're small, untracked-individually tag lists, not entities with their own identity
users edit one field at a time. `POST`/`PUT /job-targets` accept them as optional nested arrays:
present means "replace this collection with exactly these rows," absent means "leave it alone."

**No AI is implemented in this phase.** `job_target_analysis` (one row per Job Target, `ats_score`,
`keywords_matched`/`keywords_missing`, `experience_gap`, `education_gap`, `summary`) exists in the
schema so a future AI phase has a table ready to write into — nothing writes to it yet.
`JobTargetAnalysisService` exposes the shape of that future work today —
`extractKeywords(jobDescription)`, `calculateATS(jobTargetId)`,
`generateResumeSuggestions(jobTargetId)`, `generateCoverLetter(jobTargetId)` — every method throws
`NotImplementedException`; no controller route calls them. This is deliberately a **Service**, not
a Repository, even though the Phase 2B brief's wording said "repository interfaces should expose
future-ready methods": `prompts/01-coding-standards.md` reserves repositories for database
operations only, and these four are business/AI-orchestration operations. Disclosed here as an
intentional, minor deviation from the brief's literal wording, not a silent one.

The **Job URL and Job Description are stored exactly as entered** — the platform never fetches,
scrapes, or parses either field in this phase. `jobUrl` is validated only as a well-formed URL
(`@IsUrl()`); `jobDescription` is free text with a generous length cap.

An **Application** (`applications`) tracks one attempt at one Job Target — `status`
(`SAVED`→`APPLIED`→`INTERVIEW`→`OFFER`/`REJECTED`/`WITHDRAWN`/`ARCHIVED`), `appliedAt`,
`interviewDate`, `result`, `notes`. Creating an Application requires the referenced `jobTargetId`
to belong to the same user (`JobTargetService.assertOwnedJobTarget()`) — verified via the Job
Target module, never duplicated into Application's own authorization logic. As of Phase 3,
`resumeVariantId` is a real, ownership-verified FK to a Resume Variant (see §9) — Phase 2B's
placeholder `resumeId` (unvalidated, no FK, since Resume Variants didn't exist yet) has been
renamed and wired up now that they do.

**History events**: create/update on a Job Target emit `job_target_created`/`job_target_updated`,
except the specific `DRAFT`/`READY` → `ARCHIVED` transition, which emits `job_target_archived`
instead of the generic "updated" (subsequent edits to an already-archived target still emit
`job_target_updated`). Applications emit `application_created`/`application_updated`, except a
write that changes the `status` field, which emits `application_status_changed` instead. Both
reuse the same generic `ResumeEntityChangedEvent`/`HistoryListener` pattern from §7 — its `action`
type was widened (`archived`, `status_changed` added) rather than introducing a second event class,
since `HistoryListener` already handles any `entityType`/`action` pair generically.

## 9. Resume Variants Engine (Phase 3)

A **Resume Variant** (`resume_variants`) is an independent copy of the Master Resume, optionally
tailored for one Job Target — the "Resume Variant" step in the flow diagram opening §8, now
implemented. Creating one (`POST /resume-variants`) reads the caller's current Master Resume and
all 11 live sections **once**, at that instant, and writes the result into `content` (JSONB).
After that write, the Variant is **completely independent**: editing the Master Resume never
changes existing Variants, and editing a Variant never changes the Master Resume — enforced simply
by there being no live reference between the two after creation, not by an application-level guard
that could be bypassed.

### Why a JSONB snapshot, not 11 more relational "variant section" tables

The brief's CRUD list for Resume Variants (`Create/List/Get/Update/Duplicate/Archive/Restore/Delete`)
has no per-section sub-resource endpoints (no `/resume-variants/:id/work-experience`, unlike Master
Resume's 11 section endpoint groups) — the brief manages a Variant's sections as part of the
Variant itself, not as independently addressable rows. Building a second full CRUD engine (11 more
tables, 11 more controllers, a second `SECTION_DEFINITIONS`-style registry) to back that would be
significant unrequested scope. A JSONB snapshot is simpler, and matches the project's own
established precedent: `cv-data-model.md` already designs `CVVersion.content` (JSONB) as exactly
this kind of "filtered/exported snapshot of the Master Resume" — see [cv-data-model.md](cv-data-model.md)
§7 ("Why Not Relational-Per-Section") for the same argument applied there. A future phase can
still add relational per-section Variant editing without a breaking change — `content`'s shape
already mirrors Master Resume's section field names (see below), so a migration path exists.

### What gets copied

`content` holds: the Master Resume's own fields (`title`, `summary`, `careerLevel`,
`yearsExperience`, `desiredPosition`, `desiredSalary`, `currency`) plus one array per section type,
keyed by the same names as `MasterResume`'s own Prisma relations (`workExperiences`, `educations`,
`skills`, `languages`, `certificates`, `projects`, `courses`, `awards`, `publications`,
`volunteerExperiences`, `references`). Each section record is copied with its content fields and
`displayOrder`, but stripped of `id`/`resumeId`/timestamps — those pointed at the live section row
the copy came from, which is meaningless (and misleading) once independent. **Profile (personal/
contact info) is never copied** — the brief says "copies all sections from the Master Resume," not
from Profile, so a Variant's `content` is professional data only.

### Fields beyond `content`

| Field                                         | Notes                                                                                                                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `user_id`, `master_resume_id` (both FK) |                                                                                                                                                                                                                             |
| `job_target_id` (nullable FK)                 | Optional — a Variant can exist without being tied to any Job Target                                                                                                                                                         |
| `title`                                       | User-facing name, e.g. "Backend Engineer @ Acme"                                                                                                                                                                            |
| `version`                                     | **Edit counter**, not a version-history table — bumped by every content-editing `PUT`, never by Archive/Restore. A future phase can add real version history (mirroring `CvVersion`) without changing this column's meaning |
| `status`                                      | Open string, default `DRAFT` — same rationale as `MasterResume.status` (no closed value set specified)                                                                                                                      |
| `archived`                                    | Boolean, separate from soft-delete: `archived` = hidden-but-still-active (toggled by Archive/Restore), `deleted_at` = removed (set by Delete). Requesting brief listed both "status" and "archived flag" as distinct fields |
| `completion_percentage`                       | Server-computed only — see below                                                                                                                                                                                            |
| `created_at` / `updated_at` / `deleted_at`    | Soft-deleted (§3 of [database-overview.md](database-overview.md))                                                                                                                                                           |

### Its own completion percentage

Each Variant computes completion from its own frozen `content`, never by querying the Master
Resume — same boolean-checklist-average approach as `ResumeCompletionService` (§4), narrowed to
what a snapshot actually carries (no profile/photo/linkedin, since Profile isn't copied):
`title` present, `content.summary` present, and `workExperiences`/`educations`/`skills`/`languages`
each non-empty — 6 checks, `round(passed/6*100)`. Recomputed on create, on duplicate (copies the
source's percentage, since content is identical), and on any `PUT` that includes `title` or
`content`; unaffected by Archive/Restore (state, not content, changes).

### Operations

| Operation         | Route                                                                  | Notes                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create            | `POST /resume-variants`                                                | Snapshots the Master Resume; 404 if the user has no Master Resume yet; optional `jobTargetId` is ownership-verified                                                        |
| List / Get        | `GET /resume-variants`, `GET /resume-variants/:id`                     | Owner-only + admin bypass                                                                                                                                                  |
| Update            | `PUT /resume-variants/:id`                                             | `content`, when present, **wholesale-replaces** the snapshot (same pattern as Job Target's keyword/skill/language collections); bumps `version`                            |
| Duplicate         | `POST /resume-variants/:id/duplicate`                                  | Creates a brand-new, independent row copying the source's `content`; emits `created`, not `updated` — a duplicate is a new entity, not an edit. `version` resets to 1      |
| Archive / Restore | `PUT /resume-variants/:id/archive`, `PUT /resume-variants/:id/restore` | Toggle `archived`. **Idempotent**: archiving an already-archived Variant (or restoring an already-active one) is a no-op — same state returned, no duplicate history event |
| Delete            | `DELETE /resume-variants/:id`                                          | Soft delete only (`deleted_at`)                                                                                                                                            |

### History events

`resume_variant_created`, `resume_variant_updated`, `resume_variant_archived`,
`resume_variant_restored`, `resume_variant_deleted` — same generic `ResumeEntityChangedEvent`/
`HistoryListener` pattern as §7/§8; `ResumeEntityAction` was widened again to add `'restored'`.

### Application integration

`Application.resumeVariantId` (nullable) replaces Phase 2B's placeholder `resumeId`: it is now a
real FK to `resume_variants`, verified via `ResumeVariantService.assertOwnedVariant()` — a user may
only attach a Resume Variant they own to an Application, mirroring how `jobTargetId` is verified.

### Known limitations (disclosed, in scope for a future phase)

- No relational per-section editing of a Variant's content (see "Why a JSONB snapshot" above).
- `UpdateResumeVariantDto.jobTargetId` can only be set to re-link to a _new_ Job Target — there is
  no supported way to unlink an already-linked one via this endpoint in this phase.
- No AI, ATS, Export, or Credit consumption — Resume Variants are a pure data-model/CRUD phase, per
  the Phase 3 brief's explicit scope boundary.
