# CVLab AI — Smart Application Pipeline

Status: **implemented** (2026-08-23). A guided, resumable "Prepare Application" wizard that orchestrates 6 already-existing modules — Resume Variant, ATS Analysis, Resume Optimization, Cover Letter, Interview, Export Engine, Application — without duplicating a single line of their logic. Preceded by a read-only audit ("AUDITORIA — FASE Smart Application Pipeline") and an explicit approval checkpoint before any migration.

## 1. Why this module exists

Every individual feature already existed — a user could run ATS analysis, improve their resume, generate a cover letter, practice an interview, export a PDF, and log an application, one screen at a time. Nothing tied them together into one continuous flow anchored to a specific Job Target. This module is that connective layer, and nothing else.

## 2. A schema that already existed, undocumented

The `ApplicationPipelineSession` model (+ `ApplicationPipelineStatus`/`ApplicationPipelineStep` enums) was designed and migrated (`20260803202633_candidate_experience_engine`) several phases before this one was implemented — its own doc comment already described this exact feature and cited this file, which did not yet exist. Zero application code referenced the table until this phase. The audit found it, verified it was genuinely unused (not dormant-but-load-bearing, like `Cv`/`CvVersion`), and reused it as the foundation rather than designing a second one.

Two gaps in the original design were closed in this phase's approved checkpoint migration (`20260823172242_application_pipeline_export_finalize`, additive only):

- `ApplicationPipelineStep` had no value for "export the documents" or "register the Application" — the enum stopped at `SUMMARY`. Added `EXPORT` and `FINALIZE`.
- Added `exportedDocumentId`/`applicationId` nullable columns, following the exact same plain-nullable-string convention (not `@relation`s) as every other step-result pointer already on the row.

## 3. Architecture — orchestration only

`ApplicationPipelineService` depends on `ResumeVariantService`, `JobTargetService`, `AtsAnalysisService`, `ResumeOptimizationService`, `CoverLetterService`, `InterviewService`, `ExportService`, `ApplicationService` — and nothing else. It never calls `CreditService` or `AiOrchestrationService` directly, and never duplicates any of those services' business logic. Each step method:

1. Verifies the session belongs to the caller.
2. Delegates to that step's owning service, exactly as an individual page calling that feature directly would.
3. Records the resulting id and advances `currentStep`.

This mirrors the Export Engine's own precedent for "not every paid feature routes through AI Orchestration" — see [module-boundaries.md](module-boundaries.md)'s boundary rules.

Two small, disclosed extensions to already-existing modules were needed and made in this phase:

- `ApplicationModule` and `InterviewModule` did not export their services (`ApplicationService`, `InterviewService`) — every other feature module already did. Both now do, for exactly this kind of downstream reuse.
- `ExportService.exportResume()` returned only `{buffer, fileName, contentType}` — the Pipeline needs the created `ExportedDocument`'s own id to record on the session. Extended the return type to `ExportResult extends ResumeRenderResult { exportedDocumentId }`, additive and backward-compatible (`ExportController` only reads the three original fields).

## 4. Flow

```
JobTarget detail page → "Preparar candidatura" → pick a Resume Variant
        ↓
POST /application-pipeline  { resumeVariantId, jobTargetId }
  → links the Variant to this Job Target if not already linked
  → creates ApplicationPipelineSession (currentStep: ATS_ANALYSIS)
        ↓
POST .../steps/ats                → AtsAnalysisService.run()            → atsReportId
POST .../steps/optimization        → ResumeOptimizationService.run()     → optimizationId
POST .../steps/apply-suggestions   → ResumeOptimizationService.apply()   → newAtsReportId
POST .../steps/cover-letter        → CoverLetterService.generate()       → coverLetterId
POST .../steps/interview           → InterviewService.start(mode: JOB)   → interviewSessionId
POST .../steps/export (binary)     → ExportService.exportResume()        → exportedDocumentId
POST .../steps/finalize            → ApplicationService.create()         → applicationId, status COMPLETED
```

Every step is optional and independent — the frontend never forces the user through all seven; each can be skipped, and the session can be abandoned (`PUT .../abandon`) at any point. `JOB_IMPORT`, the enum's first value, has no corresponding action in this service: a session cannot exist without an already-selected Job Target (both `resumeVariantId`/`jobTargetId` are required, non-nullable columns), so that precondition is already satisfied by the time a row exists — `ApplicationPipelineRepository.create()` starts a new session at `ATS_ANALYSIS` directly.

## 5. The export step is a second binary endpoint, deliberately

`POST /application-pipeline/:id/steps/export` returns the raw file bytes directly (same non-passthrough `@Res()` technique as `ExportController`), not JSON metadata telling the frontend to call `POST /exports/resume` separately. Calling `ExportService.exportResume()` a second time for the same logical export would not double-charge (idempotency), but it would render the file — and, for PDF, spin up headless Chromium — a second time for nothing. Exactly one render, one HTTP round trip.

## 6. Credits

The Pipeline never charges credits of its own. Every step charges exactly what it already charges independently:

| Step                   | Feature                         | Credits |
| ---------------------- | ------------------------------- | ------: |
| ATS Analysis           | deterministic, no AI            |       0 |
| Resume Optimization    | `AIFeature.RESUME_OPTIMIZATION` |      80 |
| Apply Suggestions      | (part of the optimization run)  |       0 |
| Cover Letter           | `AIFeature.COVER_LETTER`        |      40 |
| Interview (start only) | —                               |       0 |
| Export PDF             | `export_resume_pdf`             |      10 |
| Export DOCX            | `export_resume_docx`            |       5 |
| **Pipeline itself**    | —                               |   **0** |

Starting an interview session (`.../steps/interview`) never charges — it only creates the session, exactly like `POST /interview/start` on its own. Generating/answering/evaluating questions continues in the normal Interview module UI, per the brief's own "not every step must run automatically."

## 7. Security

- `assertOwnerOrAdmin` on every service method, plus an independent `findOwnedOrThrow` on the session itself.
- `start()` re-verifies ownership of the Resume Variant _and_ the Job Target **separately**, through each domain's own service — never trusts that a client-supplied pairing is legitimate. A Variant from user A cannot be combined with a Job Target from user B, regardless of who makes the request.
- Every subsequent step re-derives `resumeVariantId`/`jobTargetId`/`optimizationId`/`coverLetterId` from the session row itself, never from the request body — the client cannot smuggle a different, unowned entity id into a step call.
- 404, never 403, on a foreign/nonexistent session — same IDOR-safe pattern as every other module.

## 8. Known gaps (not this phase's scope)

- **No Application Tracker frontend page exists.** `ApplicationService`/`ApplicationController` (list/create/update/delete) have existed since Phase 2B with zero UI. The Pipeline's finalize step creates a real `Application` row, visible via `GET /applications`, but there is nowhere in the app to browse it yet. `apps/web/lib/api/applications.ts` exists only as a minimal client for this reason.
- `JobTargetAnalysisService`'s four stub methods remain unimplemented and unrelated to this module — the Pipeline's ATS step uses the real, deterministic `AtsAnalysisService` (Phase 4), never this dormant stub.

## 9. Testing

- **Backend unit**: `application-pipeline.repository.spec.ts`, `application-pipeline.service.spec.ts` — ownership (session + independently-verified Variant/JobTarget), delegation to every one of the 6 underlying services with the correct arguments, `currentStep` advancement, the apply-suggestions-before-optimization guard, `abandon()`.
- **Backend e2e** (`test/application-pipeline.e2e-spec.ts`, real Postgres/Redis/Chromium/AI, no service mocks): authentication, IDOR (foreign Variant, foreign Job Target, mixed-user pairing, foreign session), the step-ordering guard, a full real happy path through all seven steps (real ATS score, real AI-simulated optimization + suggestion apply, real cover letter, real interview session, real PDF export with a real credit charge, real Application creation confirmed independently via `GET /applications`), and abandon.
- **Frontend**: the wizard page (step rendering, the ATS step's real request, the export step's binary download) and the Job Target detail page's new "Preparar candidatura" dialog (Resume Variant selection → session creation → navigation). Testing a Radix `Select` in jsdom needed a new global `jest.setup.ts` polyfill (`scrollIntoView`/`hasPointerCapture`/`releasePointerCapture` — jsdom implements none of them); this benefits every other page in the app that already used `Select` untested until now.
