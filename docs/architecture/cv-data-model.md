# CVLab AI — CV Data Model

Status: resolved decision (approved 2026-07-30). Supersedes the earlier open question in [database-overview.md](database-overview.md) ("CV/CV-version content schema — not specified").

> **Phase 2A note:** this document describes the future CV export/versioning model. It is **not
> implemented** — the `Cv`/`CvVersion` tables exist in the Phase 0 schema but are dormant. As of
> Phase 2A, professional data lives in the **Master Resume** (see
> [master-resume-data-model.md](master-resume-data-model.md)), which is the single source of truth
> going forward. When this CV model is eventually implemented, `CVVersion.content` will be
> populated by filtering/snapshotting the Master Resume, not by separate user entry — see
> [master-resume-data-model.md](master-resume-data-model.md) §5 for the full reconciliation.

## 1. Decision

CVs use a **structured JSON document model**, stored as PostgreSQL `JSONB` via Prisma — **not** a separate relational table per CV section. This keeps the schema stable while section content evolves, and matches `prompts/10-business-rules.md` §10 (versioning) and `prompts/09-product-vision.md`'s requirement that the architecture support future expansion without redesign.

## 2. Entities

### `CV`

The stable identity/pointer record for a user's CV.

| Field                                      | Notes                                             |
| ------------------------------------------ | ------------------------------------------------- |
| `id`                                       |                                                   |
| `user_id`                                  | owner, FK → `users`                               |
| `title`                                    | user-facing name, e.g. "Frontend Developer CV"    |
| `template_id`                              | which rendering template is currently selected    |
| `current_version_id`                       | FK → `cv_versions`, the version considered "live" |
| `status`                                   | e.g. `DRAFT`, `PUBLISHED`                         |
| `created_at` / `updated_at` / `deleted_at` |

`CV` itself holds **no section content** — content only exists inside `CVVersion` rows. This is what makes versioning and restore simple: "editing a CV" is "creating (or updating, per the autosave strategy) a `CVVersion` and repointing `current_version_id`."

### `CVVersion`

| Field            | Notes                                                    |
| ---------------- | -------------------------------------------------------- |
| `id`             |                                                          |
| `cv_id`          | FK → `cvs`                                               |
| `version_number` | monotonically increasing per CV                          |
| `schema_version` | version of the JSON document shape itself (see §4)       |
| `content`        | `JSONB` — the structured CV document (§3)                |
| `created_by`     | user or system (AI improvement writes a new version too) |
| `change_summary` | optional, e.g. `"AI improvement: professional summary"`  |
| `created_at`     |

`(cv_id, version_number)` is unique. Rows in `cv_versions` are never mutated after creation — restoring a previous version means creating a **new** version whose content is copied from the old one and repointing `current_version_id`, never rewriting history in place. This gives "restore" for free without a separate undo mechanism, and keeps the version table append-only (consistent with the ledger/audit-log philosophy applied elsewhere in this project).

## 3. `content` (JSONB) Shape

Top-level structured sections, each independently optional so partial CVs are valid:

```json
{
  "personalInfo": { "fullName": "", "email": "", "phone": "", "location": "", "links": [] },
  "professionalSummary": { "text": "" },
  "experience": [
    { "company": "", "role": "", "startDate": "", "endDate": "", "current": false, "bullets": [] }
  ],
  "education": [{ "institution": "", "degree": "", "field": "", "startDate": "", "endDate": "" }],
  "skills": [{ "name": "", "level": "" }],
  "languages": [{ "name": "", "level": "" }],
  "certifications": [{ "name": "", "issuer": "", "date": "" }],
  "projects": [{ "name": "", "description": "", "links": [] }],
  "references": [{ "name": "", "contact": "", "relationship": "" }],
  "customSections": [{ "title": "", "items": [] }]
}
```

New section types are added by extending this document shape, not by adding tables or migrations — `customSections` additionally lets users add arbitrary named sections without any schema change at all.

## 4. Schema Evolution

`CVVersion.schema_version` records which shape of the JSON document a given version was written against. When the document shape changes (new required subfield, renamed key), the backend:

1. Bumps the current schema version constant.
2. Applies a migration function when _reading_ an older version for editing/rendering (transform-on-read), rather than bulk-rewriting historical `cv_versions` rows.

This keeps old versions restorable and renderable even after the live schema evolves, without a data migration blocking every release.

## 5. Template Rendering Independence

Rendering (PDF export, on-screen preview) is a pure function of `(content, template_id)` — templates live as their own versioned assets/config (`packages/ui` or a `templates` table, to be decided at Phase 5 implementation time) and are never baked into the stored CV content. This means:

- Changing a template does not require touching any `cv_versions` row.
- The same `content` document can be previewed under multiple templates.
- AI improvement operations only ever write to `content` — they never touch template/formatting concerns.

## 6. Validation

Structural validation of `content` (required top-level keys, per-field types) happens at the service layer via a DTO/schema validator (e.g. Zod or class-validator against a matching TS interface) before persisting — `JSONB` gives storage flexibility, not a license to skip validation. Never trust unvalidated JSON from the client straight into the database, per `prompts/13-api-contracts.md` §10.

## 7. Why Not Relational-Per-Section

Rejected alternative: a table per section (`cv_experience`, `cv_education`, …). Rejected because:

- Every new section type (or even minor field addition) would require a migration — directly against the roadmap's "support future sections without requiring major database redesign" requirement.
- Sections have no independent query/filter requirements in the MVP (nothing searches "all experience entries across all CVs") that would justify relational modeling's benefits.
- Versioning an entire CV is a single JSONB snapshot per version under this model; under a relational model it would require versioning N child tables in lockstep, which is materially more complex to keep atomic and restorable.

If a future requirement needs to query _inside_ a specific section across many CVs (e.g. "find all CVs mentioning skill X" for search/matching), PostgreSQL's native JSONB indexing (GIN index on `content`, or a generated column extracting a specific path) can be added without changing the storage model.
