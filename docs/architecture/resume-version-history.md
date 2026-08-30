# CVLab AI — Resume Version History

Status: **implemented, Phase 10.5** (2026-08-05). Adds full version history to Resume Variants: automatic snapshots on every content-changing action, manual "Save Version" checkpoints, automatic pre-AI-action snapshots across 4 existing AI/analysis modules, restore/duplicate-from-version, section-by-section version comparison, and a permanent Application → exact-Resume-Version reference. Builds directly on [master-resume-data-model.md](master-resume-data-model.md) §9's Resume Variant model (Phase 3) — no schema field on `resume_variants` was removed or renamed, only extended.

## 1. Why this module exists

Per the brief: "Every Resume Variant must have full version history. Users should never lose edits." Before this phase, `ResumeVariant.version` was a bare edit counter with nothing behind it — an edit bumped the number but the previous content was gone. This phase makes every content-changing action produce a real, permanent, append-only `ResumeVariantVersion` row, and teaches 5 other modules (4 AI/analysis services + Applications) to snapshot the resume state at the moments that matter to them.

## 2. Module boundary (why `resume-version/` doesn't import `resume-variant/`)

```
ResumeVariantModule  →  ResumeVersionModule   (one direction only)
ResumeVersionModule  ✗  ResumeVariantModule   (would create a cycle)
```

`ResumeVariantService` needs `ResumeVersionRepository` to write a version row on every content-changing action, so `ResumeVariantModule` imports `ResumeVersionModule`. If `ResumeVersionModule` needed anything back from `ResumeVariantModule` (e.g. `ResumeVariantService` for ownership checks), the two modules would form a circular dependency — Nest resolves those, but it's a design smell this codebase avoids on principle (see [module-boundaries.md](module-boundaries.md)).

Instead, `ResumeVersionModule` is a **leaf**: `ResumeVersionRepository`'s own read methods enforce ownership directly via a relation-filtered Prisma query —

```ts
this.prisma.resumeVariantVersion.findMany({
  where: { resumeVariantId, resumeVariant: { userId: ownerUserId, deletedAt: null } },
});
```

— joining through the `resumeVariant` relation instead of calling `ResumeVariantService.getOne()` first. `ResumeVersionService` (the read-only timeline/detail/compare API) and `ResumeDiffService` (pure diffing) have zero dependency on `resume-variant/` at all. All variant-mutating logic (restore, duplicate-from-version, checkpoint) lives in `ResumeVariantService`, not `ResumeVersionService` — the version module never writes to `resume_variants`.

## 3. Version numbering invariant

**`ResumeVariant.version` must always equal the `versionNumber` of that variant's most recent `ResumeVariantVersion` row.** Every write path that's supposed to keep this true funnels through one of two private methods on `ResumeVariantService`:

- **`recordVersion()`** — for edits to an _existing_ variant (manual edit, checkpoint, restore, snapshot-before-AI-action). Bumps `ResumeVariant.version` via `ResumeVariantRepository.applyEdit()`'s atomic `{ version: { increment: 1 } }`, then writes a `ResumeVariantVersion` row using the just-returned, already-bumped number. `applyEdit()` runs **exactly once** per call — an `extraFields` parameter lets `update()`'s title/status/jobTargetId changes ride along on that same call instead of issuing a second `applyEdit()`, which would silently bump the counter twice for one edit.
- **`recordInitialVersion()`** — for `create()`, `duplicate()`, and `duplicateFromVersion()` only. The row `ResumeVariantRepository.create()` just returned already starts at the schema's `version: 1` default (a brand-new row, not an edit to an existing one) — this method writes the matching `ResumeVariantVersion` row using that number **as-is**, deliberately without calling `applyEdit()`. Using `recordVersion()` here instead would have bumped a fresh row's `version` from 1 to 2, so the INITIAL row's `versionNumber` (2) and the value returned to the HTTP caller (1, the pre-bump object) would silently disagree with each other and with what's actually in Postgres. (A real bug caught and fixed during this phase's implementation, before it shipped.)
- **`recordAppliedContentVersion()`** — the one exception that does neither. `ResumeOptimizationService.apply()` already writes the new content **and** bumps `version` atomically inside its own `prisma.$transaction()` (alongside marking suggestions applied — see [resume-optimization.md](resume-optimization.md) §8), for reasons unrelated to version history. This method takes that transaction's already-updated `ResumeVariant` (with its already-correct `.version`) and writes the `ResumeVariantVersion` row directly via `versionRepository.create()`, trusting the given number rather than calling `applyEdit()` a second time.

All three funnel the actual row-write through `versionRepository.create()`, and Postgres's `@@unique([resumeVariantId, versionNumber])` constraint is the final backstop — even under concurrent requests, two `applyEdit()` calls on the same row can never both receive the same post-increment number (Postgres's row-level locking on the `UPDATE ... SET version = version + 1` serializes them), so two concurrently-created version rows always land on distinct, sequential numbers. Verified directly in the e2e suite (§8) by firing two concurrent restores at the same variant and asserting the two resulting version numbers are always exactly `{n, n+1}`, never a collision or a gap.

## 4. Database

Migration `20260804223000_resume_version_history`. Full row shape in [database-overview.md](database-overview.md) §1 (`resume_variant_versions`, `resume_variants`, `applications`).

- **`ResumeVersionLabel`** enum: `INITIAL | AI_OPTIMIZED | MANUAL_EDIT | INTERVIEW_VERSION | APPLICATION_VERSION | CUSTOM` — exactly the brief's rule 7 example list (`Custom` implemented as the literal enum value `CUSTOM`, paired with the free-text `customLabel` column for a user-chosen label).
- **`ResumeVersionSource`** enum: `USER | AI` — who/what triggered this snapshot.
- **`resume_variant_versions.job_target_id` / `.cover_letter_id`** — nullable, point-in-time correlation ("which Job Target/Cover Letter was this version associated with when captured"), not a live pointer to what the Variant references _today_.
- **`applications.resume_variant_version_id`** — nullable FK to `resume_variant_versions`, set once at creation (or re-set on `PUT` if `resumeVariantId` is re-attached — §7) from a fresh `snapshotForApplication()` call, never a live pointer to the Variant's current state (that's what the pre-existing `resumeVariantId` column already provides).
- **Never soft-deleted, never updated** — see [database-overview.md](database-overview.md) §3.

## 5. Module

`apps/api/src/resume-version/` (the leaf module, §2):

```
resume-diff.service.ts       Pure, synchronous section-by-section diffing (§6)
resume-version.repository.ts Only Prisma access for resume_variant_versions
resume-version.service.ts    Read-only: listTimeline / getOne / compare
resume-version.controller.ts GET /resume-variants/:variantId/versions[...]  (§9)
resume-version.module.ts     Exports all 3 providers; imports only AuthModule
dto/compare-versions.dto.ts
```

`apps/api/src/resume-variant/` additions:

```
resume-variant.service.ts        +6 methods (§3, §7) on top of the Phase 3 CRUD
dto/save-checkpoint.dto.ts       POST .../checkpoint body
```

## 6. Comparison (`ResumeDiffService`)

`compare(fromVersion, toVersion, oldContent, newContent)` walks the same 7 scalar keys + 11 array keys `resume-variant-snapshot.util.ts` (Phase 3) defines, and for each produces a `FieldDiffStatus` of `added | removed | changed | unchanged`:

- **Scalar fields** (`summary`, `careerLevel`, etc.): present-in-neither/both/one-side comparison, then a `JSON.stringify` deep-equality check for "changed" vs "unchanged".
- **Array sections** (`workExperiences`, `skills`, etc.) — a documented, deliberate 3-pass heuristic, made necessary because array items carry **no stable per-item id** (`toSnapshotSection()`, Phase 3, strips `id` when a Variant snapshot is taken):
  1. Exact-content matches (via the same `JSON.stringify` equality) are paired off first and marked `unchanged`, regardless of index — an item that only _moved position_ between versions is correctly never reported as changed.
  2. Whatever's left on both sides is paired up **positionally** and marked `changed`.
  3. Any remaining surplus on either side is a pure `added` (new-side leftovers) or `removed` (old-side leftovers).

**Known, disclosed limitation:** an item that was both reordered _and_ edited in the same version can't be distinguished from "one item removed, a different one added" — the positional pairing in pass 2 only runs against whatever pass 1 didn't already match exactly, so it has no way to know the edited item and its old position were "the same" entry. Acceptable for a v1 comparison view; a future iteration could improve match quality with a similarity heuristic (e.g. matching on a section-specific near-unique field like `company`+`title` for work experience) instead of pure positional pairing.

## 7. `ResumeVariantService` — the 6 new methods

| Method                          | What it does                                                                                                                                                                                                                                                   | Label / Source                                               | Emits                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `saveCheckpoint()`              | "Save Version" (rule 2) — snapshots the _current_ content unchanged, under a caller-chosen label (default `CUSTOM`) + optional `customLabel`/`notes`                                                                                                           | caller-chosen / `USER`                                       | `resume_variant_updated`                                                  |
| `restoreVersion()`              | Copies a historical version's content back onto the live Variant. **Creates a new version — never overwrites history** (rule 5); the version being restored _from_ is untouched                                                                                | `CUSTOM`, `customLabel: "Restored from version N"` / `USER`  | `resume_variant_updated`                                                  |
| `duplicateFromVersion()`        | "Duplicate version" (rule 6) — a brand-new, completely independent Resume Variant seeded from one historical version's content, not necessarily the Variant's live content                                                                                     | `INITIAL` / `USER`                                           | `resume_variant_created`                                                  |
| `snapshotBeforeAiAction()`      | The "before" half of the auto-snapshot hook (rule 8, §8) — snapshots the current content, unchanged, before an AI/analysis action runs. **Swallows its own errors** (logged, never thrown) — a missed audit snapshot must never block the caller's real action | caller-chosen (always `CUSTOM` in current call sites) / `AI` | none (an audit-trail-only action, not user-facing)                        |
| `recordAppliedContentVersion()` | The "after" half — snapshots content the caller already persisted itself (§3's third exception). Also swallows errors                                                                                                                                          | `AI_OPTIMIZED` / `AI`                                        | none                                                                      |
| `snapshotForApplication()`      | Rule 9 — always creates a **fresh** snapshot, never reuses an existing matching version, guaranteeing an exact-content capture at the moment of submission                                                                                                     | `APPLICATION_VERSION` / `USER`                               | none (`ApplicationService` emits its own `application_created`/`updated`) |

## 8. Auto-snapshot integration (rule 8)

```
snapshotBeforeAiAction()
  ↓
AI / analysis logic runs (may or may not mutate the Resume Variant)
  ↓
recordAppliedContentVersion()      — only when it actually does
```

Wired into all 4 named integration points, each right after the target Resume Variant/Job Target are resolved and ownership-checked, before any AI Orchestration or scoring call:

| Service                                           | Hook point                                                                                         | Label                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `ResumeOptimizationService.run()`                 | before `AiOrchestrationService.execute()`                                                          | before: `CUSTOM`                                           |
| `ResumeOptimizationService.apply()`               | **after** the suggestion-applier transaction commits (the one point that actually mutates content) | after: `AI_OPTIMIZED`, via `recordAppliedContentVersion()` |
| `AtsAnalysisService.run()`                        | before the deterministic scoring pipeline                                                          | `CUSTOM`                                                   |
| `CoverLetterService.generate()` / `.regenerate()` | before `AiOrchestrationService.execute()`                                                          | `CUSTOM`                                                   |
| `InterviewService.generateQuestions()`            | before `AiOrchestrationService.execute()`                                                          | `CUSTOM`                                                   |

Only `ResumeOptimizationService.apply()` actually mutates the Resume Variant's content — `AtsAnalysisService` is fully deterministic/read-only, and Cover Letter generation and Interview question generation each write to their _own_ table, never to `resume_variants`. The "before" snapshot at all 4 points is still valuable as an audit trail (the exact resume state a given AI/analysis run was computed against, independent of whether that run later feeds back into a content edit), matching the brief's literal instruction to snapshot before all 4 named actions, not only the one that happens to mutate content.

**Never duplicated unnecessarily; chronological order preserved:** every hook funnels through `recordVersion()`/`recordInitialVersion()`, both of which read `ResumeVariant.version` (or its just-atomically-incremented value) as the single source of truth for the next number — there is no separate "compute the next version" step anywhere that could race with, or fall out of sync with, the number `versionRepository.create()` actually persists.

## 9. Endpoints

On `ResumeVariantController` (`/api/v1/resume-variants`):

| Method & path                                 | Notes                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /:id/checkpoint`                        | Body: `{ label?, customLabel?, notes? }`. 201, returns the new `ResumeVariantVersion` row |
| `POST /:id/versions/:versionNumber/restore`   | 201, returns the updated `ResumeVariant` (content now matches the restored version)       |
| `POST /:id/versions/:versionNumber/duplicate` | Body: `{ title? }`. 201, returns the brand-new `ResumeVariant`                            |

On `ResumeVersionController` (`/api/v1/resume-variants/:variantId/versions`):

| Method & path              | Notes                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /`                    | Full timeline, newest first                                                                                                    |
| `GET /:versionNumber`      | One version's full detail (registered _after_ `/compare` in the controller so `"compare"` is never parsed as a version number) |
| `GET /compare?from=N&to=M` | Runs `ResumeDiffService.compare()` between two versions                                                                        |

All 6 routes require `JwtAuthGuard` and are **self-service-only** (`user.id` is always both requester and target) — matching every controller in this codebase since Phase 2A. Admin access exists at the service layer only, proven directly via `moduleRef.get(ResumeVersionService)` in the e2e suite, the same technique `resume-optimization.e2e-spec.ts` established.

## 10. Ownership & permissions

Every service method calls `assertOwnerOrAdmin()` first, the same shared utility every prior phase uses. `ResumeVersionRepository`'s read methods additionally filter through the `resumeVariant` relation (§2) so a non-owner querying another user's variant ID gets an **empty result** from the list endpoint (not a 404 — there's no "does this variant exist for anyone" check on the read side, only "what does this owner's join return") and a **404** from the single-version/compare endpoints (`findOneByVariantAndNumber` returns `null` → `NotFoundException`, same as every other `findOwnedOrThrow` in the codebase).

## 11. Events

Reuses `ResumeEntityChangedEvent`, no new event classes:

| Action                   | `entityType`     | `action`  | `eventType`              |
| ------------------------ | ---------------- | --------- | ------------------------ |
| `saveCheckpoint()`       | `resume_variant` | `updated` | `resume_variant_updated` |
| `restoreVersion()`       | `resume_variant` | `updated` | `resume_variant_updated` |
| `duplicateFromVersion()` | `resume_variant` | `created` | `resume_variant_created` |

`snapshotBeforeAiAction()` / `recordAppliedContentVersion()` / `snapshotForApplication()` deliberately emit nothing of their own — they're internal audit hooks invoked from inside another module's already-event-emitting flow (e.g. `ResumeOptimizationService.run()`'s own `optimization_started` event), and `ApplicationService.create()`/`.update()` already emit `application_created`/`application_updated`/`application_status_changed`.

## 12. Application linkage (rule 9)

```
Application.create() / .update({ resumeVariantId })
  ↓
ApplicationService.snapshotResumeVariantForApplication()
  ↓ assertOwnedVariant()  →  ResumeVariantService.snapshotForApplication()
Application.resumeVariantVersionId = <the fresh snapshot's id>
```

Runs on `create()` whenever `resumeVariantId` is provided, and again on `update()` whenever the caller re-attaches or switches `resumeVariantId` — each call takes an independent, fresh snapshot (never reused), so "the submitted version must always be recoverable" holds even for an application whose linked Resume Variant is edited (or re-attached to a different variant entirely) after submission.

## 13. Testing

- **Unit** (`apps/api/src/resume-variant/**/*.spec.ts` + `apps/api/src/resume-version/**/*.spec.ts`, 47 + 15 tests): `ResumeVariantService` — exhaustive coverage of all 6 new methods (success, validation, permissions, repository-failure propagation vs. swallowing, version-numbering including the `recordInitialVersion` fix, first/latest-version restore, duplicate-restore, a concurrent-restore simulation proving distinct DB-atomic version numbers rather than a locally-computed one); `ResumeVersionRepository`/`ResumeVersionService`/`ResumeDiffService` — full coverage of the read/compare paths and every diff-status branch. The 4 integration-point services (`ResumeOptimizationService`, `AtsAnalysisService`, `CoverLetterService`, `InterviewService`) and `ApplicationService` each gained an assertion that their `snapshotBeforeAiAction()`/`recordAppliedContentVersion()`/`snapshotForApplication()` call fires with the right arguments.
- **E2E** (`apps/api/test/resume-version-history.e2e-spec.ts`, 22 tests, real Postgres/Redis): authentication on every new endpoint; timeline/detail/compare correctness including an invalid-version 404; checkpoint (default + explicit label); restore (older/first/latest version, duplicate-restore, **two concurrent restores asserted to land on distinct sequential version numbers**, invalid-version 404); duplicate-from-version (independence from the source, custom title, invalid-version 404); cross-user isolation across all 5 mutating/read endpoints; admin access via the service-level bypass (§9); soft-delete behavior (a deleted Variant's versions vanish from every relation-filtered query but the rows survive physically); history events; the Application → `resumeVariantVersionId` flow end-to-end, including that editing the Variant afterward never changes what was recorded.
- **Cleanup fallout, fixed this phase:** the new `resume_variant_versions` FK (no cascade) broke the `afterAll` cleanup transactions in 5 pre-existing e2e suites (`ats-engine`, `cover-letter`, `interview`, `resume-optimization`, `resume-variant-engine`) — each now deletes `applications` → `resumeVariantVersion` rows → `resumeVariant` rows, in that order, before the rest of their existing cleanup. All 6 suites (90 tests) pass together.

## 14. Known limitations (disclosed, not fixed this phase)

- **Diff quality for reordered-and-edited array items** — §6's documented positional-pairing limitation.
- **No frontend yet** — Timeline component, Compare Versions page, Restore dialog, Diff viewer are tracked as separate roadmap items (frontend Phase 10.5 work), out of scope for this backend-only phase.
- **No pruning/retention policy.** Every content-changing action creates a permanent row; a very actively-edited Variant will accumulate an unbounded number of versions. Acceptable for MVP scope — flagged as a future operational concern, not a correctness issue.
- **`snapshotBeforeAiAction()`'s label is always `CUSTOM` in every current call site** — there was no dedicated "pre-AI snapshot" label in the brief's rule-7 list, and reusing `AI_OPTIMIZED` for a snapshot that predates any actual optimization would have been misleading. Revisit if the product wants these visually distinguished from manual checkpoints in the timeline UI.

## 15. Dependency Diagram

```
ResumeVariantModule → ResumeVersionModule           (one direction only — §2)
ResumeOptimizationModule → ResumeVariantModule       (unchanged — now also triggers 2 snapshot hooks)
AtsModule → ResumeVariantModule                      (unchanged — now also triggers 1 snapshot hook)
CoverLetterModule → ResumeVariantModule               (unchanged — now also triggers 1 snapshot hook × 2 call sites)
InterviewModule → ResumeVariantModule                 (unchanged — now also triggers 1 snapshot hook)
ApplicationModule → ResumeVariantModule                (unchanged — now also triggers snapshotForApplication())

Never: ResumeVersionModule → ResumeVariantModule (would cycle — §2)
Never: ResumeVersionModule → any of the 5 modules above
```
