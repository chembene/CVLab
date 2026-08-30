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
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

export function importEsm<T>(specifier: string): Promise<T> {
  return nativeImport(specifier) as Promise<T>;
}
