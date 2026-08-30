# CVLab AI — Tech Debt Register

Disclosed, deliberately deferred issues — each one is a conscious tradeoff made to keep a phase
moving rather than an oversight. Resolve during the dedicated Hardening Phase (post Phase 10.5)
unless a specific phase's brief says otherwise.

## Backend e2e suite: intermittent failures on full sequential run (Phase 10.5)

**Symptom:** `npm run test:e2e` (all 12 suites, `--runInBand`) intermittently fails 3-6 tests after
~9+ minutes of continuous execution — observed across suites unrelated to each other (`health`,
`cover-letter`, `resume-engine`, `cv-import`), with failure modes that don't repeat consistently
(hook timeouts, a single cold-parse 400). Each suite passes reliably in isolation — this repo's
new [cv-import.md](../architecture/cv-import.md) engine included: 19/19 unit tests and 6/6 e2e
tests green run standalone, every time.

**Probable causes** (not yet root-caused; disclosed rather than guessed at further):

1. **Resource/connection exhaustion under sustained sequential load.** Every e2e suite boots a
   full `AppModule` (fresh Postgres + Redis connections) via `Test.createTestingModule`; 12 suites
   back-to-back over 9+ minutes is a lot of connection churn against one shared local
   `docker-compose` Postgres/Redis, and Jest's default 5000ms hook/test timeout leaves little
   margin once the system is under that sustained load.
2. **pdfjs-dist lazy initialization cost.** `CVParser.extractPdfText()` (Phase 10.5) dynamically
   imports `pdfjs-dist/legacy/build/pdf.mjs` (see [cv-import.md](../architecture/cv-import.md)
   "Why pdfjs-dist, not pdf-parse") — the first parse in a process pays pdf.js's WASM/module
   cold-start cost, which is more sensitive to system load than the rest of the suite (already
   bumped one test's timeout to 15s in `test/cv-import.e2e-spec.ts`, but a full 12-suite run
   still occasionally trips it or an adjacent suite's default 5s timeout).
3. Possible interaction between `NODE_OPTIONS=--experimental-vm-modules` (added to `test:e2e` in
   Phase 10.5, required for pdfjs-dist's real dynamic `import()` to work inside Jest's VM sandbox
   — see [cv-import.md](../architecture/cv-import.md)) and Jest's own module-registry teardown
   between suites under `--runInBand`, though the CV Import suite itself is unaffected when run
   alone with the same flag.

**Why deferred, not fixed now:** per this phase's explicit instruction, the isolated quality gate
(unit + e2e for the feature under active development, plus typecheck/lint/build) is this project's
source of truth for "is this feature done," not a 9-minute full-suite run's stability. Chasing
full-suite flakiness now would trade scope on the 15+ remaining Phase 10.5 features for marginal
CI-hygiene gain.

**Hardening Phase action items:**

- Raise Jest's default `testTimeout` in `test/jest-e2e.json` (global, not per-test) to something
  realistic for a full sequential Postgres-backed run.
- Investigate whether each e2e suite's `beforeAll` should reuse one shared `TestingModule`/DB
  connection pool across files instead of bootstrapping `AppModule` fresh per suite.
- Consider warming `pdfjs-dist` once in a global Jest setup file so its cold-start cost is paid
  once for the whole run, not attributed to whichever suite happens to run first.
- Re-run the full suite in isolation (no other processes competing for CPU/DB connections) to
  determine how much of the flakiness is this machine's contention vs. a genuine suite-ordering
  bug.
