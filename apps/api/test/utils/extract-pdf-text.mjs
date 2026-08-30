// Runs as a standalone Node process (see extractPdfText() in
// export-engine.e2e-spec.ts), deliberately OUTSIDE Jest's VM-module
// sandbox: pdfjs-dist's legacy build is ESM-only, and calling a dynamic
// `import()` of it from inside a long `--runInBand` Jest run hits Node's
// process-global ESM module cache — if an EARLIER test file (e.g.
// cv-import.e2e-spec.ts, which also dynamically imports pdfjs-dist via
// CvParser) already loaded it and then had its own Jest environment torn
// down, a LATER file's `import()` of the "same" specifier can resolve
// against that now-dead environment and throw "Test environment has been
// torn down". A short-lived child process has no such shared state.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';

const [, , pdfPath] = process.argv;
const data = new Uint8Array(readFileSync(pdfPath));
const pdf = await getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
try {
  const pageTexts = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  process.stdout.write(pageTexts.join('\n'));
} finally {
  await pdf.destroy();
}
