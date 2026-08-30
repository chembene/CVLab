# CVLab AI — Job Import Engine

Status: **implemented, Phase 10.5** (2026-08-04, enhanced same day). Users paste a job posting URL instead
of typing a Job Target by hand. The engine fetches the page, extracts structured data, normalizes it, and
**automatically creates a `JobTarget`** — no preview/confirm round trip (unlike [cv-import.md](cv-import.md),
which explicitly requires one). Low-confidence extractions are never withheld; they're flagged
`REQUIRES_REVIEW` instead.

## 1. Why JSON-LD, not per-ATS scraping

CLAUDE.md's "Do Not Guess" rule blocks inventing undocumented API/DOM contracts. Rather than guess at each
ATS's private CSS class names (which also breaks the instant a vendor redesigns their page), every parser in
this module is built on two **public, documented web standards**:

- **schema.org's [`JobPosting`](https://schema.org/JobPosting) type**, emitted as JSON-LD
  (`<script type="application/ld+json">`) — the mechanism Google for Jobs requires for a listing to be
  indexed, which is _why_ Greenhouse, Lever, Workday, LinkedIn, Indeed, and most "generic" career pages
  already embed it. Real, verifiable, stable.
- **The [Open Graph protocol](https://ogp.me)** (`og:title`/`og:description`/`og:image`/`og:site_name`) —
  used as a fallback when a page has no JobPosting JSON-LD, and as the _first_ priority for the company logo
  (see §5).

`utils/structured-data.util.ts` implements both extractors. `utils/job-html-parser.util.ts` is the one real
parsing implementation (JSON-LD → Open Graph → bare HTML, in that trust order) that every parser in
`parsers/` calls — see §3.

## 2. Database

Migrations `20260804201421_job_import_engine`, `20260804202846_job_import_extracted_data`,
`20260804211215_job_import_logo_and_duplicates`.

### `job_targets` (extended, Phase 2B table)

- `JobTargetStatus` gained `REQUIRES_REVIEW` (rule 10) — set instead of `READY` when overall extraction
  confidence falls below `JOB_IMPORT_CONFIDENCE_THRESHOLD` (0.6).
- `jobUrl`/`jobDescription`'s Phase 2B doc comments ("never scraped, fetched, or parsed by the platform")
  are superseded when the row is created via `POST /job-import` — see the schema comment for the disclosed
  reconciliation. Manually-created JobTargets are untouched by this module.

### `job_import_metadata` (new)

One row per JobTarget created via `POST /job-import` — the fetch/extraction audit trail. **Not**
soft-deleted, unlike almost every other table in this codebase — a point-in-time import record with no
surviving JobTarget to explain has no product meaning to preserve (`onDelete: Cascade` on the
`jobTargetId` FK).

| Column                | Type                                                     | Notes                                                                                                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | uuid PK                                                  |                                                                                                                                                                                                                                                                                                                  |
| `job_target_id`       | uuid FK → `job_targets`, unique                          | 1:1                                                                                                                                                                                                                                                                                                              |
| `source_url`          | text, indexed                                            | Post-redirect final URL. The dedup lookup key (§6).                                                                                                                                                                                                                                                              |
| `provider`            | text                                                     | `ParserRegistry.select()`'s chosen parser name — `greenhouse`\|`lever`\|`workday`\|`linkedin`\|`indeed`\|`generic`                                                                                                                                                                                               |
| `raw_html`            | text                                                     | The full fetched page — rule 6 ("store the original HTML")                                                                                                                                                                                                                                                       |
| `cleaned_description` | text                                                     | Plain-text description — rule 7 ("store the cleaned description")                                                                                                                                                                                                                                                |
| `company_logo_url`    | text, nullable                                           | Resolved once, priority chain — see §5                                                                                                                                                                                                                                                                           |
| `extracted_data`      | jsonb                                                    | The full `ParsedJobData` — responsibilities/requirements/niceToHave/benefits/**skills**/**technologies**/languages arrays, normalized seniority/employmentType, salary (min/max/currency/**period**), experience (min/preferred years), education level. The frontend's import-preview screen's source of truth. |
| `field_confidence`    | jsonb                                                    | Per top-level `ParsedJobData` field, 0-1 — rule 12/8 ("confidence visualization support")                                                                                                                                                                                                                        |
| `overall_confidence`  | float                                                    | Mean of `field_confidence`'s values                                                                                                                                                                                                                                                                              |
| `extracted_at`        | timestamp                                                | When the data was **actually** extracted — preserved across dedup reuse (§6), never reset                                                                                                                                                                                                                        |
| `duplicate_of_id`     | uuid FK → `job_import_metadata`, nullable, self-relation | Set when this row's data was copied from a prior import of the same URL rather than freshly fetched — §6                                                                                                                                                                                                         |

## 3. Module

`apps/api/src/job-import/`:

```
interfaces/job-parser.interface.ts   ParsedJobData, JobParser contract, the 3 fixed normalization enums
utils/
  structured-data.util.ts            JSON-LD JobPosting + Open Graph + favicon extraction (§1)
  job-html-parser.util.ts            The ONE real parsing implementation every parser delegates to
  job-section-splitter.util.ts       Header-keyword splitting: responsibilities/requirements/niceToHave/benefits
  job-field-heuristics.util.ts       Seniority/employmentType/skills/technologies/salary/experience/education normalization
  company-logo.util.ts               4-step logo priority chain (§5)
parsers/
  greenhouse.parser.ts   lever.parser.ts   workday.parser.ts
  linkedin.parser.ts     indeed.parser.ts  generic-html.parser.ts
parser-registry.ts        Hostname → parser selection, generic last
job-fetcher.ts             SSRF-safe HTTP fetch — the only network I/O in this module
job-import.repository.ts   Only Prisma access for job_import_metadata
job-import.service.ts      Orchestrates everything (§4)
job-import.controller.ts   2 endpoints (§7)
job-import.module.ts
dto/import-job.dto.ts
```

**"No parser should know about another parser"**: each parser only knows its own hostname pattern and
calls the shared, neutral `parseJobHtml()` util — the same relationship CVParser's shared regex constants
have to `CVParser` itself. A parser is never imported by another parser. `ParserRegistry` is the _only_
place that knows every parser exists.

## 4. Main Flow

```
POST /job-import { url }
  ↓
JobImportService.importFromUrl()
  ↓
Duplicate check (JobImportRepository.findLatestBySourceUrl) — §6
  │
  ├─ HIT: reuse cached extraction, skip network entirely
  │
  └─ MISS:
       JobFetcher.fetchHtml()        (SSRF-guarded — see docs/architecture/security-architecture.md)
         ↓
       ParserRegistry.select(hostname)
         ↓
       parser.parse(html, finalUrl)  → { data: ParsedJobData, confidence: JobFieldConfidence }
  ↓
overallConfidence = mean(confidence values)
  ↓
JobTargetService.create()   — title/company/location/employmentType/seniority/salary/jobUrl/jobDescription
                               + status (READY | REQUIRES_REVIEW)
                               + skills (dedup(skills ∪ technologies))
                               + languages
  ↓
JobImportRepository.create() — the audit row (§2), duplicateOfId set if reused
```

`JobTargetService.create()` is reused unchanged from Phase 2B — this module never duplicates Job Target
CRUD/child-collection logic, matching the "compose, don't duplicate" rule every prior phase follows.

## 5. Company Logo (rule 1)

`utils/company-logo.util.ts` resolves one URL, no extra network fetch (staying inside `JobFetcher`'s single
SSRF-guarded request per import), in the brief's exact priority order:

1. **Open Graph image** (`og:image`) — the page's own social-preview image, often the actual role/company
   banner.
2. **Company favicon** — [Google's public favicon service](https://www.google.com/s2/favicons) (a real,
   widely-used technique, not a guessed-at endpoint) resolved against the _company's own_ domain, derived
   from schema.org `hiringOrganization.url`/`sameAs` — distinct from the job board's own domain.
3. **Organization schema** — schema.org `hiringOrganization.logo` itself (plain URL or `ImageObject.url`).
4. **Website favicon** — the current page's own `<link rel="icon">`, or, failing that, the favicon service
   against the page's own hostname.

## 6. Duplicate Detection (rule 13)

**"If exactly the same URL was already imported, reuse the previous parsed metadata. Do not parse again."**

`JobImportRepository.findLatestBySourceUrl(dto.url)` checks the **input** URL (pre-fetch, pre-redirect)
against every prior import's stored `sourceUrl` (which is the **post-redirect final** URL from _that_
import). This means dedup reliably fires when a user re-pastes the exact same link — the intended UX — but
can miss a match if the first import redirected somewhere new and a later paste of a _different_,
pre-redirect URL would have landed on the same page. Disclosed, not fixed: catching that case would require
either an extra pre-flight HEAD request (another network round trip and another SSRF surface) or storing
every historically-seen input URL, neither of which the brief asks for.

On a hit: **zero network calls, zero re-parsing** — `extractedData`/`fieldConfidence`/`overallConfidence`/
`rawHtml`/`companyLogoUrl`/`provider` are copied byte-for-byte from the prior row into a **brand-new**
`JobImportMetadata` row (required — `jobTargetId` is unique per row, and a fresh `JobTarget` is always
created for the _requesting_ user, never shared across users). `extractedAt` is carried over from the
**original** extraction, not reset to "now" — the audit trail keeps reporting when the data was actually
extracted. `duplicateOfId` points at the source row.

`JobImportService` degrades gracefully (empty-array defaults, not a 500) if a reused row's `extractedData`
predates a `ParsedJobData` shape change from an older deploy — see the inline comment in
`importFromUrl()`.

## 7. Endpoints

| Method & path                           | Notes                                                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /job-import`                      | Body: `{ url }` (`@IsUrl`). Returns `{ jobTarget, overallConfidence, fieldConfidence, reusedExisting }`.                                                          |
| `GET /job-import/:jobTargetId/metadata` | The audit row behind an already-created JobTarget — the frontend's import-preview/confidence-highlighting screen's data source. 404 for another user's JobTarget. |

Both require `JwtAuthGuard`, self-service-only, matching every controller since Phase 2A.

## 8. Skills vs. Technologies (rules 2 & 3)

Two disjoint curated keyword lists in `job-field-heuristics.util.ts`:

- **`skills`** — languages, frameworks, office/productivity tools, soft technical skills (TypeScript,
  NestJS, React, Excel, Power BI, Git, Agile, Communication, ...).
- **`technologies`** — cloud/infra/data-platform terms (AWS, Azure, Google Cloud, PostgreSQL, Redis, Kafka,
  Docker, Kubernetes, ...).

A handful of terms straddle both in casual usage (Azure, Docker) — categorized once under technologies to
keep the two lists disjoint rather than duplicating matches. Both arrays are kept **distinct** in
`JobImportMetadata.extractedData` for the frontend to render as two separate chip lists, but **collapse into
one `JobTargetSkill` collection** when creating the `JobTarget` — the only structured slot the existing
Phase 2B schema offers (no dedicated "technologies" child table exists on `JobTarget`). Deduplicated
case-insensitively before insertion.

## 9. Normalization (rules 5, 6, 7, 8, 9)

| Field                                             | Fixed target set / shape                                                                                    | Source                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seniority`                                       | `Intern \| Junior \| Mid \| Senior \| Lead \| Principal \| Manager \| Director \| Executive`                | Title/description keyword scan, highest-seniority-first priority (a title mentioning two levels resolves to the more senior one)                                                                                                                                |
| `employmentType`                                  | `Full Time \| Part Time \| Contract \| Internship \| Freelance \| Temporary \| Remote \| Hybrid \| On-site` | schema.org `employmentType` enum first; falls back to free-text Remote/Hybrid/On-site/Freelance scanning. Deliberately conflates contract-type and work-location into one field per the brief's single explicit list — disclosed, not a schema.org distinction. |
| `salaryMin`/`salaryMax`/`currency`/`salaryPeriod` | numbers + ISO currency + `HOURLY\|WEEKLY\|MONTHLY\|YEARLY`                                                  | schema.org `baseSalary` first; falls back to regex over free text (`"$80,000 - $100,000 per year"`)                                                                                                                                                             |
| `experienceMinYears`/`experiencePreferredYears`   | integers                                                                                                    | Regex over requirements + description (`"5+ years"`, `"3-5 years"`, `"at least 2 years"`)                                                                                                                                                                       |
| `educationLevel`                                  | `High School \| Bachelor \| Master \| PhD`                                                                  | Keyword scan (PT + EN), highest level mentioned wins                                                                                                                                                                                                            |

## 10. Confidence Visualization Support (rule 12)

`JobFieldConfidence = Partial<Record<keyof ParsedJobData, number>>` — generic by construction, so every
field this document adds (`skills`, `technologies`, `companyLogoUrl`, `salaryPeriod`,
`experienceMinYears`/`experiencePreferredYears`, `educationLevel`) automatically has a confidence slot with
no interface change required. `overallConfidence` is the mean of whatever keys are present; missing a field
entirely (nothing found) means no confidence entry at all, not a `0`.

## 11. Security

`JobFetcher` is the only network I/O boundary: scheme validation (http/https only), DNS-resolved
private/loopback/link-local/CGNAT IP blocking (checked on **every** redirect hop, not just the initial
URL), bounded redirects (5), a 5MB response cap, and a 10s timeout. See
[security-architecture.md](security-architecture.md) for the full SSRF rationale — 12 dedicated unit tests
in `job-fetcher.spec.ts` cover this in isolation.

## 12. Known Limitations (disclosed, not fixed this phase)

- **Dedup can miss redirect chains** — see §6.
- **Employment type conflates contract-type and work-location** — a real posting can be both "Full Time"
  and "Remote," but this field stores only one value, per the brief's single explicit 9-value list.
- **No AI-assisted extraction.** Entirely deterministic (regex/keyword-list heuristics + public structured
  data standards) — same "not AI" precedent as the Phase 4 ATS Engine and, for the same CLAUDE.md AI-integrity
  reason, [cv-import.md](cv-import.md)'s CVParser.
- **SmartRecruiters/Ashby/BambooHR have no dedicated parser** — they fall back to `GenericHtmlParser`
  (rule 11), which still works reasonably well via JSON-LD/Open Graph but has no provider-specific
  URL-derived fallbacks the way Greenhouse/Lever/Workday do.

## 13. Testing

- **Unit** (74 tests across `apps/api/src/job-import/**/*.spec.ts`): every heuristic function
  (seniority/employment-type/skills/technologies/salary+period/experience-years/education-level/company-URL
  derivation), JSON-LD/Open Graph/favicon extraction (including malformed-JSON-LD resilience and `@graph`
  array traversal), section splitting, `ParserRegistry` hostname routing (all 6 parsers + generic
  fallback), `JobFetcher`'s SSRF guard (12 dedicated cases: private/loopback/link-local/CGNAT rejection,
  redirect re-validation, size cap, timeout), and `JobImportService` (ownership, confidence-threshold
  status branching, skill/technology dedup, description-folding, and duplicate-detection reuse incl. the
  legacy-shape defensive fallback).
- **E2E** (`apps/api/test/job-import.e2e-spec.ts`, 5 tests, real Postgres): full import against a faked
  `JobFetcher` (the network I/O boundary swapped exactly like `ai-orchestration.e2e-spec.ts` swaps
  `AIProvider` — `JobFetcher`'s own SSRF logic is covered separately, unmocked, in `job-fetcher.spec.ts`),
  covering the READY/REQUIRES_REVIEW status split, skills+technologies→JobTargetSkill merging, the logo
  field, malformed-URL rejection, ownership isolation on the metadata endpoint, and duplicate-URL reuse
  (including the preserved-`extractedAt` and distinct-JobTarget-per-user assertions).

## 14. Dependency Diagram

```
Job Import → Job Target (create() reused unchanged, Phase 2B)
Job Import → JobFetcher (the only network I/O in this module, SSRF-guarded)

Never: Job Import → AI Orchestration / CreditService / any AIProvider (fully deterministic, no AI, no cost)
Never: any parser → any other parser (ParserRegistry is the only thing that knows they all exist)
```
