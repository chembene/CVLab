import { randomUUID } from 'crypto';

/**
 * A real, native `import()` that survives TypeScript's CommonJS module
 * compilation. When `tsconfig.json` targets `"module": "commonjs"` (this
 * project's setting, per prompts/01-coding-standards.md), `tsc` rewrites a
 * literal `await import(specifier)` into `Promise.resolve().then(() =>
 * require(specifier))` — fine for CommonJS packages, but fatal for
 * ESM-only ones (e.g. pdfjs-dist's `legacy/build/pdf.mjs`, which
 * `CVParser` needs), since `require()` cannot load a `.mjs` file
 * (`ERR_REQUIRE_ESM`). Constructing the `import()` call inside a
 * `Function` body hides it from `tsc`'s static rewrite, so Node's real
 * dynamic import runs at runtime instead.
 */
// The body carries a per-evaluation unique comment. V8 caches a `Function`
// constructor's compiled code by its source text across contexts, and the
// cached function keeps the `import()` hook of the context that compiled it
// first. Under Jest's VM modules (the e2e suite loads this module once per
// test file, all in one process) a later test file would then call a hook
// bound to an earlier, already torn-down test environment and fail with
// "Test environment has been torn down" — whenever it was not among the first
// two files of the run. A unique source forces a fresh compile per module
// evaluation. In production the module is evaluated once, so nothing changes.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const nativeImport = new Function(
  'specifier',
  `return import(specifier) /* ${randomUUID()} */`,
) as (specifier: string) => Promise<unknown>;

export function importEsm<T>(specifier: string): Promise<T> {
  return nativeImport(specifier) as Promise<T>;
}
