import { Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import type * as PdfJs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { importEsm } from '../common/utils/dynamic-import.util';
import type { CvFileType } from '@prisma/client';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';
import type {
  CvDraftMeta,
  CvFieldConfidence,
  CvParseResult,
  ExtractedAward,
  ExtractedCertificate,
  ExtractedCvData,
  ExtractedEducation,
  ExtractedLanguage,
  ExtractedProject,
  ExtractedReference,
  ExtractedSkill,
  ExtractedVolunteerExperience,
  ExtractedWorkExperience,
} from './interfaces/extracted-cv-data.interface';

// ---------------------------------------------------------------------
// FASE 5 audit (2026-08-12) — StructuredResumeDraft: deterministic
// per-entry confidence/warnings scoring. Every function below reads only
// the entry's own already-extracted fields (or the raw chunk it came
// from) — no invented signal, no AI call anywhere in this module. See
// `CvDraftMeta`'s doc comment (extracted-cv-data.interface.ts) for why
// this metadata is baked directly onto each entity rather than a separate
// wrapper structure.
// ---------------------------------------------------------------------

const SOURCE_TEXT_MAX_LENGTH = 240;

/** The raw chunk this entry was parsed from, capped for display — never fabricated, always a genuine substring of the document. */
function buildSourceText(chunk: string[]): string | undefined {
  const joined = chunk.join(' ').replace(/\s+/g, ' ').trim();
  if (!joined) return undefined;
  return joined.length > SOURCE_TEXT_MAX_LENGTH
    ? `${joined.slice(0, SOURCE_TEXT_MAX_LENGTH).trim()}…`
    : joined;
}

/** Every document-sourced (non-fallback) score is capped just below "certain" — even a fully-populated, cleanly-parsed entry is a heuristic read of unstructured text, not a database lookup. */
function clampConfidence(score: number): number {
  return Math.max(0, Math.min(0.9, Math.round(score * 100) / 100));
}

function scoreWorkExperience(
  e: Pick<
    ExtractedWorkExperience,
    'company' | 'position' | 'startDate' | 'endDate' | 'currentlyWorking' | 'description'
  >,
): {
  confidence: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let score = 0.5;
  if (e.company) score += 0.1;
  else warnings.push('Empresa não identificada.');
  if (e.position) score += 0.1;
  else warnings.push('Cargo não identificado.');
  if (e.startDate) score += 0.1;
  else warnings.push('Data de início não identificada.');
  if (e.endDate || e.currentlyWorking) score += 0.05;
  if (e.description) score += 0.05;
  if (e.company && e.position && e.company.toLowerCase() === e.position.toLowerCase()) {
    warnings.push(
      'Cargo e empresa têm o mesmo texto — verifique se a extração dividiu corretamente esta entrada.',
    );
  }
  return { confidence: clampConfidence(score), warnings };
}

function scoreEducation(
  e: Pick<ExtractedEducation, 'institution' | 'degree' | 'startDate' | 'description'>,
): {
  confidence: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let score = 0.5;
  if (e.institution) score += 0.15;
  else warnings.push('Instituição não identificada.');
  if (e.degree) score += 0.1;
  else warnings.push('Grau ou curso não identificado.');
  if (e.startDate) score += 0.1;
  else warnings.push('Data não identificada.');
  if (e.description) score += 0.05;
  return { confidence: clampConfidence(score), warnings };
}

function scoreCertificate(e: Pick<ExtractedCertificate, 'title' | 'issuer' | 'issueDate'>): {
  confidence: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let score = 0.45;
  if (e.title) score += 0.15;
  else warnings.push('Título não identificado.');
  if (e.issuer) score += 0.15;
  else warnings.push('Entidade emissora não identificada.');
  if (e.issueDate) score += 0.1;
  return { confidence: clampConfidence(score), warnings };
}

function scoreProject(e: Pick<ExtractedProject, 'title' | 'description' | 'url'>): {
  confidence: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let score = 0.4;
  if (e.title) score += 0.2;
  else warnings.push('Título não identificado.');
  if (e.description) score += 0.15;
  if (e.url) score += 0.05;
  return { confidence: clampConfidence(score), warnings };
}

function scoreAward(e: Pick<ExtractedAward, 'title' | 'issuer' | 'dateAwarded'>): {
  confidence: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let score = 0.4;
  if (e.title) score += 0.2;
  else warnings.push('Título não identificado.');
  if (e.issuer) score += 0.15;
  if (e.dateAwarded) score += 0.1;
  return { confidence: clampConfidence(score), warnings };
}

function scoreVolunteer(
  e: Pick<ExtractedVolunteerExperience, 'organization' | 'role' | 'startDate' | 'description'>,
): {
  confidence: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let score = 0.4;
  if (e.organization) score += 0.15;
  else warnings.push('Organização não identificada.');
  if (e.role) score += 0.15;
  else warnings.push('Função não identificada.');
  if (e.startDate) score += 0.1;
  if (e.description) score += 0.05;
  return { confidence: clampConfidence(score), warnings };
}

function scoreReference(
  e: Pick<ExtractedReference, 'name' | 'email' | 'phone' | 'position' | 'company'>,
): {
  confidence: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let score = 0.5;
  if (e.name) score += 0.15;
  else warnings.push('Nome do contacto não identificado.');
  if (e.email) score += 0.1;
  if (e.phone) score += 0.05;
  if (e.position || e.company) score += 0.05;
  return { confidence: clampConfidence(score), warnings };
}

/** Skills have no internal structure to score for completeness — confidence is a flat, header-anchored value, only lowered by a warning when the token itself looks like a bad split. */
function scoreSkill(name: string): { confidence: number; warnings: string[] } {
  const warnings: string[] = [];
  if (name.length < 2) warnings.push('Nome muito curto — verifique se foi extraído corretamente.');
  return { confidence: 0.6, warnings };
}

function scoreLanguage(e: Pick<ExtractedLanguage, 'proficiency'>): {
  confidence: number;
  warnings: string[];
} {
  let score = 0.55;
  if (e.proficiency) score += 0.15;
  return { confidence: clampConfidence(score), warnings: [] };
}

/**
 * Overrides a document-path entry's draft metadata for the
 * `parseFallbackDatedEntries()` recovery path: recovered without ANY
 * recognized section header, so — regardless of how complete the entry
 * itself looks — it gets a fixed, deliberately low confidence and an
 * explicit warning, replacing whatever `scoreWorkExperience()`/
 * `scoreEducation()` computed for the "document" path (this function is
 * always applied AFTER those, see `parseFallbackDatedEntries()`).
 */
function markAsFallback<T extends CvDraftMeta>(entry: T): T {
  return {
    ...entry,
    source: 'fallback',
    confidence: 0.3,
    warnings: [
      'Recuperado automaticamente — o cabeçalho desta secção não foi reconhecido no documento. Reveja com atenção.',
      ...(entry.warnings ?? []),
    ],
  };
}

const MONTHS: Record<string, number> = {
  jan: 0,
  janeiro: 0,
  january: 0,
  fev: 1,
  fevereiro: 1,
  feb: 1,
  february: 1,
  mar: 2,
  marco: 2,
  março: 2,
  march: 2,
  abr: 3,
  abril: 3,
  apr: 3,
  april: 3,
  mai: 4,
  maio: 4,
  may: 4,
  jun: 5,
  junho: 5,
  june: 5,
  jul: 6,
  julho: 6,
  july: 6,
  ago: 7,
  agosto: 7,
  aug: 7,
  august: 7,
  set: 8,
  setembro: 8,
  sep: 8,
  sept: 8,
  september: 8,
  out: 9,
  outubro: 9,
  oct: 9,
  october: 9,
  nov: 10,
  novembro: 10,
  november: 10,
  dez: 11,
  dezembro: 11,
  dec: 11,
  december: 11,
};

const CURRENT_MARKERS = ['presente', 'atual', 'atualmente', 'current', 'present', 'now', 'ongoing'];

/** Section header keyword dictionaries, Portuguese + English — see docs/architecture/cv-import.md "Section Detection". */
const SECTION_HEADERS: Record<
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'certificates'
  | 'projects'
  | 'awards'
  | 'volunteer'
  | 'references',
  string[]
> = {
  // FASE 3 (2026-08-12 audit): each list below already covered every
  // variant explicitly requested by the brief; the additions here are extra
  // real-world synonyms found in actual CVs, added conservatively — never a
  // word ambiguous enough to misfire on a different section (e.g.
  // "cursos"/"habilitacoes" alone stays out: "cursos" collides with the
  // separate, not-yet-imported Course model, and a bare "formacao" already
  // covers education without needing riskier partial words).
  summary: [
    'resumo',
    'resumo profissional',
    'resumo pessoal',
    'apresentacao',
    'perfil',
    'perfil profissional',
    'sobre',
    'sobre mim',
    'sobre o candidato',
    'summary',
    'professional summary',
    'profile',
    'about',
    'about me',
    'objective',
    'objetivo',
    'objetivo profissional',
  ],
  experience: [
    'experiencia profissional',
    'experiencia',
    'experiencias profissionais',
    'historico profissional',
    'trajetoria profissional',
    'vida profissional',
    'work experience',
    'professional experience',
    'employment history',
    'experience',
    'work history',
    'career history',
  ],
  education: [
    'formacao academica',
    'formacao',
    'educacao',
    'habilitacoes',
    'habilitacoes academicas',
    'percurso academico',
    'trajetoria academica',
    'education',
    'academic background',
    'qualifications',
  ],
  skills: [
    'competencias',
    'habilidades',
    'competencias tecnicas',
    'areas de competencia',
    'conhecimentos',
    'skills',
    'technical skills',
    'core skills',
    'competencies',
  ],
  languages: ['idiomas', 'linguas', 'languages'],
  certificates: [
    'certificacoes',
    'certificados',
    'certifications',
    'certificates',
    'licenses & certifications',
    'licenses and certifications',
  ],
  projects: ['projetos', 'projetos realizados', 'projects', 'projetos pessoais'],
  // Phase 12 canonical-model addition.
  awards: [
    'premios',
    'distincoes',
    'reconhecimentos',
    'awards',
    'honors',
    'honors & awards',
    'achievements',
  ],
  volunteer: [
    'voluntariado',
    'trabalho voluntario',
    'experiencia de voluntariado',
    'volunteer',
    'volunteer experience',
    'volunteering',
  ],
  references: ['referencias', 'references'],
};

type SectionKey = keyof typeof SECTION_HEADERS;

// Multi-level domains (e.g. Mozambique's ".co.mz" — the platform's initial
// market, CLAUDE.md) need the repeated `(?:\.[\w-]+)*` group — the original
// single-label version truncated "acme.co.mz" to "acme.co", silently
// dropping the real TLD from every extracted email.
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d{1,4}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/;
const LINKEDIN_RE = /(https?:\/\/)?(www\.)?linkedin\.com\/[a-z0-9\-_/]+/i;
const GITHUB_RE = /(https?:\/\/)?(www\.)?github\.com\/[a-z0-9\-_/]+/i;
const GENERIC_URL_RE = /(https?:\/\/)?(www\.)?[a-z0-9-]+\.[a-z]{2,}(\/[a-z0-9\-_/.]*)?/gi;
const DATE_RANGE_RE =
  /([a-zA-Zçãáéíóõâêô]*\.?\s*\/?\d{4}|\d{1,2}\/\d{4})\s*(?:-|–|—|a|to|até)\s*([a-zA-Zçãáéíóõâêô]*\.?\s*\/?\d{4}|\d{1,2}\/\d{4}|presente|atual|current|present|now)/i;
// Same date-range pattern, anchored to the START of the line — used to
// detect "date + company" opening lines (e.g. "2018 - 2019 Beta, Lda"),
// which are a valid new-entry signal in their own right regardless of
// whether the chunk being closed already contains a date itself.
const LEADING_DATE_RANGE_RE = new RegExp(`^\\s*(?:${DATE_RANGE_RE.source})\\s*`, 'i');

/** A line that opens with a date range followed by real trailing text (e.g. "2018 - 2019 Beta, Lda") — used both as a chunk-boundary and a section-boundary signal (see chunkEntries() and splitIntoSections()). */
function isDateLedLineWithTrailingText(line: string): boolean {
  const stripped = line.replace(LEADING_DATE_RANGE_RE, '');
  return (
    stripped.length > 0 &&
    stripped.length < line.length &&
    stripped.length <= 70 &&
    !/[.!?]$/.test(stripped.trim())
  );
}

/**
 * Extracts structured CV data from raw PDF/DOCX text without any AI call —
 * deliberate: an AI structuring pass (via the deterministic DummyAIProvider)
 * cannot actually read the uploaded file's real content, so routing this
 * through AI Orchestration would fabricate experience/education entries
 * unrelated to what the user uploaded, violating CLAUDE.md's "AI must never
 * invent user qualifications, experiences, degrees, companies,
 * certifications or achievements." Every field here is derived from the
 * document's own text via regex (contact details/links — high confidence)
 * or header-keyword section-splitting (career sections — medium/low
 * confidence, disclosed per-field in CvFieldConfidence). See
 * docs/architecture/cv-import.md.
 */
@Injectable()
export class CVParser {
  async extractText(buffer: Buffer, fileType: CvFileType): Promise<string> {
    if (fileType === 'PDF') {
      return this.extractPdfText(buffer);
    }
    const result = await mammoth.convertToHtml({ buffer });
    return this.extractDocxText(result.value);
  }

  /**
   * FASE 4 audit (2026-08-12): unlike PDF (§ extractPdfText's
   * reorderLinesForColumns), DOCX extraction previously had NO column
   * awareness at all — `mammoth.extractRawText()` returns paragraphs in the
   * document's raw internal order, and a 2-column CV built in Word almost
   * always uses a single-row, 2-cell `Table` as the layout container (the
   * standard technique — real column/section-based layout is a print-only
   * Word concept mammoth doesn't represent at all). Reading that table's raw
   * paragraph order interleaves the two "columns" cell-by-cell exactly the
   * same way the PDF path used to before its own column-aware fix.
   *
   * This switches to `mammoth.convertToHtml()` (which preserves the
   * `<table>`/`<tr>`/`<td>` structure `extractRawText()` throws away) and,
   * when the HTML contains exactly one single-row, 2-cell table with
   * substantial content in both cells, emits each cell as one contiguous
   * block — the same "guarantee columns stay contiguous, don't attempt true
   * reading-order reconstruction" strategy as the PDF fix, applied to DOCX's
   * own layout-container idiom instead of X/Y coordinates.
   *
   * Deliberately conservative, mirroring the PDF fix's two-sided-evidence
   * requirement: any table that ISN'T a single row of exactly 2 cells with
   * multiple paragraphs each (e.g. a genuine multi-row data table listing
   * "Skill | Level" per row, or a short 2-cell header/contact-info bar)
   * falls straight through to normal whole-document paragraph order — never
   * guessed at.
   */
  private extractDocxText(html: string): string {
    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
    if (!tableMatch) {
      return this.extractHtmlParagraphs(html).join('\n');
    }

    const rows = [...tableMatch[1]!.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    if (rows.length !== 1) {
      // Multiple rows reads as a genuine data table, not a 2-column layout
      // container — never reorder it.
      return this.extractHtmlParagraphs(html).join('\n');
    }

    const cells = [...rows[0]![1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      this.extractHtmlParagraphs(m[1]!),
    );
    if (cells.length !== 2 || cells.some((cellLines) => cellLines.length < 3)) {
      // Not exactly 2 cells, or one side too sparse to be a real column
      // (e.g. a short "Name | Title" header table) — safe fallback.
      return this.extractHtmlParagraphs(html).join('\n');
    }

    const tableStart = tableMatch.index ?? 0;
    const before = this.extractHtmlParagraphs(html.slice(0, tableStart));
    const after = this.extractHtmlParagraphs(html.slice(tableStart + tableMatch[0].length));
    return [...before, ...cells[0]!, ...cells[1]!, ...after].join('\n');
  }

  /** Every `<p>` element's text content, tags stripped and HTML entities decoded, in document order. Inline tags (`<strong>`, `<em>`, ...) are replaced with a space rather than removed outright, so two adjacent styled words never get glued together. */
  private extractHtmlParagraphs(html: string): string[] {
    return [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) =>
        this.decodeHtmlEntities((m[1] ?? '').replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((line) => line.length > 0);
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  /**
   * Uses pdfjs-dist (Mozilla's actively-maintained PDF.js) directly via its
   * documented Node "legacy" build, rather than the `pdf-parse` wrapper
   * package — `pdf-parse`@1.x's bundled pdfjs fork throws "bad XRef entry"
   * on spec-valid, classic-cross-reference-table PDFs (reproduced against
   * both a hand-built minimal PDF and pdfkit's own output; pdfjs-dist reads
   * both correctly), and `pdf-parse`@2.x requires Node worker/ESM flags
   * this API doesn't run with. Dynamic `import()` is required because
   * pdfjs-dist's legacy build only ships as ESM (`pdf.mjs`) — loaded via
   * importEsm() rather than a literal `import()`, since tsc's CommonJS
   * output would otherwise downlevel that into a `require()` call that
   * cannot load a `.mjs` file (see dynamic-import.util.ts).
   */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    const { getDocument } = await importEsm<typeof PdfJs>('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      verbosity: 0,
    });
    const pdf = await loadingTask.promise;
    try {
      const pageTexts: string[] = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        const lines = this.groupTextItemsIntoPositionedLines(content.items);
        const orderedLines = this.reorderLinesForColumns(lines, viewport.width);
        pageTexts.push(orderedLines.map((l) => l.text).join('\n'));
      }
      return pageTexts.join('\n');
    } finally {
      await pdf.destroy();
    }
  }

  /**
   * Groups pdf.js's flat item stream into lines, same text-joining rule as
   * before (a space between items on the same line, honoring pdf.js's own
   * `hasEOL` line-break heuristic) — but also captures each line's starting
   * X position and rendered width, needed by reorderLinesForColumns() to
   * detect a multi-column layout. Line CONTENT is unchanged from the
   * original implementation; only ordering downstream can differ.
   */
  private groupTextItemsIntoPositionedLines(
    items: Awaited<ReturnType<PdfJs.PDFPageProxy['getTextContent']>>['items'],
  ): { text: string; x: number; width: number }[] {
    const lines: { text: string; x: number; width: number }[] = [];
    let text = '';
    let x: number | undefined;
    let rightEdge = 0;
    for (const item of items) {
      if (!('str' in item)) continue;
      if (x === undefined) x = item.transform[4] as number;
      text += item.str;
      rightEdge = (item.transform[4] as number) + item.width;
      if (item.hasEOL) {
        lines.push({ text, x: x ?? 0, width: rightEdge - (x ?? 0) });
        text = '';
        x = undefined;
      } else {
        text += ' ';
      }
    }
    if (text.length > 0) {
      lines.push({ text, x: x ?? 0, width: rightEdge - (x ?? 0) });
    }
    return lines;
  }

  /**
   * Real-CV-confirmed root cause of "CV import scrambles/loses sections":
   * pdf.js returns text in content-stream (draw) order, not visual reading
   * order. For a single-column CV that's harmless — draw order already
   * matches top-to-bottom reading order. For a 2-column CV (a sidebar with
   * Contact/Skills/Languages next to a main column with
   * Profile/Experience/Education, a very common template), draw order can
   * emit one column's lines as one contiguous block followed by the other
   * column's block, or interleave them — either way, `splitIntoSections()`'s
   * single "current section" pointer has no way to know two DIFFERENT,
   * visually-parallel flows are being concatenated, so one column's
   * trailing unclaimed/unheaded content silently gets misattributed to
   * whatever section the OTHER column last recognized.
   *
   * This doesn't attempt true bidirectional reading-order reconstruction
   * (which column visually comes "first" is ambiguous and doesn't actually
   * matter for header/body adjacency) — it only guarantees each column's
   * lines stay CONTIGUOUS and never interleaved with the other column's, so
   * a header always stays adjacent to its own column's body text. Only
   * fires when there's strong, unambiguous 2-column evidence on BOTH halves
   * of the page; a normal single-column page (the overwhelming majority of
   * uploads) is guaranteed to pass through with its original line order
   * completely unchanged.
   */
  private reorderLinesForColumns<T extends { x: number; width: number }>(
    lines: T[],
    pageWidth: number,
  ): T[] {
    if (pageWidth <= 0 || lines.length < 8) return lines;

    const midX = pageWidth / 2;
    const left = lines.filter((l) => l.x < midX);
    const right = lines.filter((l) => l.x >= midX);

    // Require a REAL population on both sides — never reorder a normal
    // single-column page just because a handful of lines (right-aligned
    // dates, a stray indented bullet) happen to start past the midpoint.
    if (left.length < 4 || right.length < 4) return lines;

    // A genuine column is made of many lines each narrower than the page
    // (sidebar/main-column text wraps within its own width) — a page of
    // ordinary indented prose is still full-page-width paragraphs, not a
    // real column, even if some lines happen to start past the midpoint.
    const NARROW_RATIO = 0.55;
    const narrowShare = (group: T[]) =>
      group.filter((l) => l.width < pageWidth * NARROW_RATIO).length / group.length;
    if (narrowShare(left) < 0.6 || narrowShare(right) < 0.6) return lines;

    return [...left, ...right];
  }

  parse(rawText: string): CvParseResult {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .flatMap((line) => this.splitGluedLetterSpacedHeader(line))
      .map((line) => this.collapseLetterSpacing(line));

    if (lines.length === 0) {
      throw new InvalidPromptError('The uploaded file has no extractable text.');
    }

    const confidence: CvFieldConfidence = {};
    const personalData = this.extractPersonalData(rawText, lines, confidence);
    const { sections, unclaimed } = this.splitIntoSections(lines);

    const summary = sections.summary?.join(' ').trim();
    if (summary) {
      confidence.summary = 0.55;
    }

    // If the header itself went unrecognized, sections.experience/.education
    // are undefined and every one of their lines landed in `unclaimed`
    // instead of being silently lost — parseFallbackDatedEntries() recovers
    // whatever of that is date-anchored. Only used when the header-based
    // pass found nothing, so a normal, correctly-headered CV never touches
    // this path. The contact-info preamble (name/email/phone/links) is
    // itself always "unclaimed" — it sits before any header, recognized or
    // not — so it must be stripped first, or chunkEntries() merges it
    // straight into whatever dated entry follows it as one bogus "entry"
    // whose title is the person's own name.
    const unclaimedWithoutPersonalData = unclaimed.filter((line) => {
      if (personalData.fullName && line === personalData.fullName) return false;
      if (personalData.email && line.includes(personalData.email)) return false;
      if (personalData.phone && line.includes(personalData.phone)) return false;
      if (personalData.linkedin && line.includes(personalData.linkedin)) return false;
      if (personalData.github && line.includes(personalData.github)) return false;
      if (personalData.website && line.includes(personalData.website)) return false;
      return true;
    });

    let workExperiences = this.parseExperience(sections.experience ?? []);
    let educations = this.parseEducation(sections.education ?? []);
    if (workExperiences.length === 0 || educations.length === 0) {
      const fallback = this.parseFallbackDatedEntries(unclaimedWithoutPersonalData);
      if (workExperiences.length === 0 && fallback.experiences.length > 0) {
        workExperiences = fallback.experiences;
        confidence.workExperiences = 0.3; // recovered without a recognized header — flag for review
      }
      if (educations.length === 0 && fallback.educations.length > 0) {
        educations = fallback.educations;
        confidence.educations = 0.3;
      }
    }
    if (workExperiences.length > 0 && confidence.workExperiences === undefined) {
      confidence.workExperiences = 0.5;
    }
    if (educations.length > 0 && confidence.educations === undefined) {
      confidence.educations = 0.5;
    }

    const skills = this.parseSkills(sections.skills ?? []);
    if (skills.length > 0) {
      confidence.skills = 0.6;
    }

    const languages = this.parseLanguages(sections.languages ?? []);
    if (languages.length > 0) {
      confidence.languages = 0.55;
    }

    const certificates = this.parseCertificates(sections.certificates ?? []);
    if (certificates.length > 0) {
      confidence.certificates = 0.45;
    }

    const projects = this.parseProjects(sections.projects ?? []);
    if (projects.length > 0) {
      confidence.projects = 0.4;
    }

    const awards = this.parseAwards(sections.awards ?? []);
    if (awards.length > 0) {
      confidence.awards = 0.4;
    }

    const volunteerExperiences = this.parseVolunteerExperiences(sections.volunteer ?? []);
    if (volunteerExperiences.length > 0) {
      confidence.volunteerExperiences = 0.4;
    }

    const references = this.parseReferences(sections.references ?? []);
    if (references.length > 0) {
      confidence.references = 0.6; // anchored on an email/phone match — see parseReferences()
    }

    const data: ExtractedCvData = {
      personalData,
      summary,
      workExperiences,
      educations,
      skills,
      languages,
      certificates,
      projects,
      awards,
      volunteerExperiences,
      references,
    };

    return { data, confidence, rawText };
  }

  // ---------------------------------------------------------------------
  // Personal data (regex — high confidence)
  // ---------------------------------------------------------------------

  private extractPersonalData(rawText: string, lines: string[], confidence: CvFieldConfidence) {
    const email = rawText.match(EMAIL_RE)?.[0];
    if (email) confidence['personalData.email'] = 0.95;

    const phone = this.extractPhone(rawText);
    if (phone) confidence['personalData.phone'] = 0.85;

    const linkedin = rawText.match(LINKEDIN_RE)?.[0];
    if (linkedin) confidence['personalData.linkedin'] = 0.9;

    const github = rawText.match(GITHUB_RE)?.[0];
    if (github) confidence['personalData.github'] = 0.9;

    const website = this.extractWebsite(rawText, email, linkedin, github);
    if (website) confidence['personalData.website'] = 0.6;

    const fullName = this.extractFullName(lines, email);
    if (fullName) confidence['personalData.fullName'] = 0.6;

    return { fullName, email, phone, linkedin, github, website };
  }

  private extractPhone(text: string): string | undefined {
    const match = text.match(PHONE_RE);
    if (!match) return undefined;
    const digits = match[0].replace(/[^\d+]/g, '');
    return digits.length >= 7 ? match[0].trim() : undefined;
  }

  private extractWebsite(
    text: string,
    email?: string,
    linkedin?: string,
    github?: string,
  ): string | undefined {
    const candidates = text.match(GENERIC_URL_RE) ?? [];
    const emailDomain = email?.split('@')[1]?.toLowerCase();
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      if (lower.includes('linkedin.com') || lower.includes('github.com')) continue;
      if (emailDomain && lower.includes(emailDomain)) continue;
      if (linkedin?.toLowerCase().includes(lower) || github?.toLowerCase().includes(lower))
        continue;
      return candidate.trim();
    }
    return undefined;
  }

  /** First line that isn't a contact-info line and looks like a 2-5 word name. */
  private extractFullName(lines: string[], email?: string): string | undefined {
    for (const line of lines.slice(0, 5)) {
      if (email && line.includes(email)) continue;
      if (EMAIL_RE.test(line) || LINKEDIN_RE.test(line) || GITHUB_RE.test(line)) continue;
      if (/\d{4,}/.test(line)) continue; // phone/date-heavy line
      const words = line.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 5 && line.length <= 60) {
        return line;
      }
    }
    return undefined;
  }

  /**
   * Collapses "letter-spaced" text back into real words — e.g. a PDF header
   * styled with wide letter-spacing extracts as "E X P E R I E N C I A
   * P R O F I S S I O N A L" (one space between every letter, a *wider* gap
   * marking the real word boundary). Extremely common in templated/designed
   * CVs (Canva and similar tools routinely style section headers this way)
   * and, confirmed against a real failing import, was the actual root cause
   * of "only name+contact extracted": the header text was present in the
   * extracted string the whole time, just never in a form the header
   * dictionary could match. Only fires when a line is genuinely
   * letter-spaced (most whitespace-separated tokens are exactly 1
   * character) — normal prose and short real acronyms ("DOM BOSCO (ISDB)")
   * are left untouched.
   */
  private collapseLetterSpacing(line: string): string {
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 4) return line;
    const singleCharTokens = tokens.filter((t) => t.length === 1).length;
    if (singleCharTokens / tokens.length < 0.6) return line;

    // Word boundaries in the original letter-spaced text survive as a
    // *wider* gap (2+ spaces) than the single space between letters of the
    // same word — split on that first, then collapse the single spaces
    // left inside each word-chunk.
    return line
      .trim()
      .split(/ {2,}/)
      .map((chunk) => chunk.replace(/(?<=\S) (?=\S)/g, ''))
      .join(' ');
  }

  /**
   * Splits a letter-spaced section header that pdf.js glued onto its own
   * body paragraph on the SAME physical line (no line break in between) —
   * e.g. "P R O F I L E Monitoring, Evaluation, and Learning (MEL)
   * Professional with over 7 years..." — into two logical lines: the
   * collapsed header ("PROFILE") and the body text that follows it, on its
   * own line. Real-CV-confirmed: without this, `headerAt()`'s length gate
   * (a header line is never allowed to be paragraph-length) rejects the
   * whole line outright, so the header is never recognized AND the
   * paragraph gets misattributed as body content of whatever section was
   * last recognized (here, the summary/profile text became a bogus first
   * "work experience" entry, since "Work Experience" was the preceding
   * recognized header).
   *
   * Deliberately narrow to avoid false positives on ordinary sentences that
   * happen to start with a header-like word ("Skills include Python..."):
   * only triggers on a run of 3+ literal SINGLE-CHARACTER tokens at the
   * very start of the line (the unambiguous letter-spacing artifact — a
   * normal word is never tokenized letter-by-letter) whose collapsed form
   * exactly matches one of our known single-word header keywords.
   */
  private splitGluedLetterSpacedHeader(line: string): string[] {
    const tokens = line.split(/\s+/).filter(Boolean);
    let boundary = 0;
    while (boundary < tokens.length && tokens[boundary]!.length === 1) boundary++;
    if (boundary < 3 || boundary >= tokens.length) return [line];

    const collapsedHeader = tokens.slice(0, boundary).join('');
    const rest = tokens.slice(boundary).join(' ');
    const normalizedHeader = collapsedHeader.toLowerCase();
    const isKnownHeaderWord = Object.values(SECTION_HEADERS).some((keywords) =>
      keywords.includes(normalizedHeader),
    );
    if (!isKnownHeaderWord) return [line];

    return [collapsedHeader, rest];
  }

  // ---------------------------------------------------------------------
  // Section splitting (header-keyword heuristic)
  // ---------------------------------------------------------------------

  /**
   * Returns both the header-recognized sections AND every line that was
   * never claimed by any of them — i.e. every line before the first
   * recognized header, plus (crucially) every line that would otherwise be
   * silently dropped when a header goes unrecognized mid-document (unusual
   * wording, an icon/number prefix, or the header text simply never making
   * it into the extracted string at all — e.g. a stylized/outlined header
   * in a templated PDF). Diagnosed via scripts/diagnose-cv-parser.ts: with
   * the pre-existing exact-match-only header check, a single unrecognized
   * header meant every line under it vanished with zero trace — personal
   * data (regex-based, header-independent) kept working while every other
   * section came back completely empty. `unclaimed` is what lets parse()
   * recover from that (see parseFallbackDatedEntries()) instead of just
   * losing the content outright.
   */
  private splitIntoSections(lines: string[]): {
    sections: Partial<Record<SectionKey, string[]>>;
    unclaimed: string[];
  } {
    const normalized = (line: string) =>
      line
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        // Strips a leading bullet/number/icon-ish prefix ("1. ", "• ", "- ",
        // "► ") — real-world templates routinely decorate section headers
        // this way, which would otherwise defeat an exact-prefix match.
        .replace(/^[\d.)\-•●○►▪*\s]+/, '')
        .replace(/[:\-–—]+$/, '')
        .trim();

    const headerAt = (line: string): SectionKey | undefined => {
      // Loosened from 45 — real headers legitimately run longer ("Formação
      // Académica e Profissional", "Professional Work Experience"), and a
      // header merged with a stray trailing character during extraction
      // shouldn't fall through to being silently misfiled as body text.
      if (line.length > 60) return undefined;
      const n = normalized(line);
      for (const [key, keywords] of Object.entries(SECTION_HEADERS) as [SectionKey, string[]][]) {
        for (const kw of keywords) {
          if (n === kw || n.startsWith(`${kw} `)) return key;
          // Substring match — only for a short line whose content, once the
          // keyword itself is removed, is nothing but symbols/digits/spaces
          // (a header wrapped in decoration the prefix/suffix strip above
          // didn't cover, e.g. "== Experiência ==" or "* Formação *").
          // FASE 3 audit (2026-08-12) tightened this from a bare
          // `n.includes(kw)`: a genuinely short body line can innocently
          // CONTAIN a keyword as a substring without being about to become a
          // new section — e.g. a job title "Gestora de Projetos - Acme Lda"
          // (Project Manager) contains "projetos" but is not a Projects
          // header, and a short summary sentence ending "...projetos." hits
          // the same trap. Requiring the remainder to be letter-free keeps
          // catching genuine decorated headers while no longer misreading
          // ordinary short sentences/titles that merely mention the word.
          if (n.length <= 35 && n.includes(kw) && !/[a-z]/i.test(n.replace(kw, ''))) return key;
        }
      }
      return undefined;
    };

    const sections: Partial<Record<SectionKey, string[]>> = {};
    const unclaimed: string[] = [];
    let current: SectionKey | undefined;

    for (const line of lines) {
      const header = headerAt(line);
      if (header) {
        current = header;
        sections[current] = sections[current] ?? [];
        continue;
      }
      // A summary/profile paragraph is free-form prose with no internal
      // structure — unlike experience/education, nothing legitimately
      // interrupts it except a new recognized header. But real-CV-confirmed
      // (see docs/architecture/cv-import.md §7a): when a document's
      // extraction order puts a "date + company" line right after the
      // profile text with no header in between — a symptom of the disclosed
      // 2-column-layout scrambling limitation — `summary` would otherwise
      // swallow the actual job entries whole, leaving `workExperiences`
      // empty even though the text is right there. A line that itself
      // opens with a date range followed by real trailing text is strong,
      // self-contained evidence that a new job just started here — treat it
      // as an implicit section boundary back to `experience`, the same way
      // an explicit header would. Deliberately scoped to `summary` only
      // (not skills/languages/etc.) since that's the one confirmed case.
      if (current === 'summary' && isDateLedLineWithTrailingText(line)) {
        current = 'experience';
        sections[current] = sections[current] ?? [];
        sections[current]!.push(line);
        continue;
      }
      if (current) {
        sections[current]!.push(line);
      } else {
        unclaimed.push(line);
      }
    }

    return { sections, unclaimed };
  }

  /**
   * Best-effort recovery for the case above: `unclaimed` lines that were
   * never attributed to any recognized section. Only chunks that contain an
   * actual date range are ever treated as a candidate entry — a bare skill
   * or language list has no date to anchor on, so it's deliberately left
   * unrecovered here rather than guessed at (skills/languages/certificates/
   * projects stay dependent on header recognition; a disclosed limitation,
   * see docs/architecture/cv-import.md). A dated chunk is classified as
   * education only when its title line contains a common
   * institution/degree keyword — everything else dated defaults to
   * experience, the far more common case. Every fallback-derived entry gets
   * a deliberately low confidence score so the review screen flags it.
   */
  private parseFallbackDatedEntries(unclaimed: string[]): {
    experiences: ExtractedWorkExperience[];
    educations: ExtractedEducation[];
  } {
    const EDUCATION_HINTS = [
      'universidade',
      'instituto',
      'faculdade',
      'escola',
      'licenciatura',
      'bacharelato',
      'mestrado',
      'doutoramento',
      'curso tecnico',
      'curso técnico',
      'ensino medio',
      'ensino médio',
      'university',
      'college',
      'institute',
      'school',
      'bachelor',
      'master',
      'degree',
      'diploma',
    ];

    const datedChunks = this.chunkEntries(unclaimed).filter((chunk) =>
      DATE_RANGE_RE.test(chunk.join(' ')),
    );

    const experiences: ExtractedWorkExperience[] = [];
    const educations: ExtractedEducation[] = [];

    for (const chunk of datedChunks) {
      const titleLine = (chunk[0] ?? '').toLowerCase();
      const isEducation = EDUCATION_HINTS.some((hint) => titleLine.includes(hint));
      if (isEducation) {
        educations.push(...this.parseEducation(chunk).map(markAsFallback));
      } else {
        experiences.push(...this.parseExperience(chunk).map(markAsFallback));
      }
    }

    return { experiences, educations };
  }

  /**
   * Splits a section's lines into blank-line-delimited entries. Since
   * header-stripped `lines` already dropped blank lines, a new entry starts
   * whenever a line looks like a new title.
   *
   * Three independent signals trigger that, any one is sufficient:
   *  1. The line arrives right after a long (description-like) line — the
   *     classic case of one entry's flowing prose ending and the next
   *     entry's title beginning.
   *  2. The CURRENT chunk already contains a date range AND has more than
   *     one line already (i.e. we're past its own opening title-or-date
   *     line, not still ON it) AND this line doesn't read like a sentence
   *     (no trailing `.`/`!`/`?`) — diagnosed via scripts/diagnose-cv-parser.ts
   *     against a short-one-line-bullet-per-achievement CV (a very common
   *     real-world format): signal 1 alone never fires because no
   *     individual bullet is ever "long," so two entirely distinct jobs
   *     silently merged into one, with the second job's title/dates dumped
   *     into the first's description. Titles ("Analista de Marketing -
   *     Acme SA") essentially never end in terminal punctuation; bullet
   *     sentences ("Aumentei o ROI em 30%.") almost always do — a cheap,
   *     reliable way to tell "next job" from "next bullet" without a
   *     lookahead or a second keyword dictionary. The `current.length > 1`
   *     guard (found against a real CV whose entries open with a
   *     "2022-2024 Company Name" line) stops the date on that very first
   *     line from immediately triggering a split against the entry's own
   *     second line (its actual job title).
   *  3. The line itself STARTS with a date range followed by more text
   *     (e.g. "2018 - 2019 Beta Consultoria, Lda") — a "date + company"
   *     opening line is strong independent evidence of a new entry on its
   *     own, unlike signal 2 it doesn't need the chunk being closed to
   *     already contain a date. That matters because when an entry's date
   *     and company sit on two separate lines ("2019 - 2021" then, on its
   *     own line, "Pro Truck Logistics"), the bare date line has no
   *     residual text and so never trips signal 3 itself — it's absorbed
   *     as a trailing line of the PRECEDING chunk, leaving the entry that
   *     follows with no date at all in its own chunk. Confirmed against a
   *     real user's CV: without this signal, the entry after the one with
   *     the split date/company lines lost its company field entirely (its
   *     "date + company" line stayed stuck as the previous entry's
   *     trailing description).
   */
  private chunkEntries(lines: string[]): string[][] {
    const chunks: string[][] = [];
    let current: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const nextLine = lines[i + 1];
      const previous = current[current.length - 1];
      // Same disambiguation as splitEntryTitleAndSubtitle()'s
      // thirdLineContinuesLowercase: a PDF-wrapped bullet's first physical
      // line ("Apoio na elaboração de orçamentos operacionais") can look
      // exactly like a short, capitalized, unpunctuated title line — the
      // giveaway is that the NEXT line continues the sentence in lowercase
      // ("para o departamento..."), which a genuine title line is never
      // followed by. Without this guard, a chunk that already has a date
      // (very common right after a "date + company"/title pair) would
      // wrongly split its own first bullet off into a bogus new entry.
      //
      // That lowercase-continuation check doesn't catch every wrap, though
      // (real-CV-confirmed): a bullet can wrap right before another
      // capitalized acronym/proper-noun ("...funded by USAID, ECHO," /
      // "SIDA, FCDO, and others..."), where the next line legitimately
      // starts uppercase. A trailing bare comma is a second, independent
      // giveaway that catches this case too — a real entry title is a short
      // noun phrase and structurally never ends with one (a comma only ever
      // trails when a sentence/list got cut off mid-flow by the wrap).
      const nextLineContinuesLowercase = nextLine != null && /^[a-zà-öø-ÿ]/.test(nextLine.trim());
      const isShortCapitalizedNonSentence =
        line.length <= 70 &&
        /^[A-Z]/.test(line) &&
        !/[.!?,]$/.test(line.trim()) &&
        !nextLineContinuesLowercase;
      const afterLongDescription = (previous?.length ?? 0) > 70;
      const currentChunkHasDate = current.length > 1 && DATE_RANGE_RE.test(current.join(' '));
      const isDateLedEntryLine = isDateLedLineWithTrailingText(line);

      const looksLikeNewTitle =
        current.length > 0 &&
        ((isShortCapitalizedNonSentence && (afterLongDescription || currentChunkHasDate)) ||
          isDateLedEntryLine);
      if (looksLikeNewTitle) {
        chunks.push(current);
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
  }

  /**
   * Splits one entry's lines into { title, subtitle, rest } — shared by
   * parseExperience()/parseEducation(). Two supported line-1 formats,
   * covering the two real shapes seen so far:
   *  A. "Title - Subtitle" (or "Title | Subtitle" / "Title @ Subtitle") all
   *     on one line, dates anywhere in the chunk — the original, still most
   *     common format. A comma is deliberately NOT treated as a separator
   *     here — Portuguese/Mozambican company names routinely end in
   *     ", Lda"/", SA", which a comma-split would wrongly tear in two.
   *  B. Line 1 is just a date + subtitle (e.g. "2022-2024 Acme Corp") and
   *     line 2 is the actual title on its own — confirmed against a real
   *     failing import where format A's split logic put the company name
   *     into `title` and buried the real title inside `description`.
   * Never invents a value for a field the text doesn't actually have —
   * an unmatched field is left undefined, exactly like the pre-existing
   * one-line-only logic did.
   */
  private splitEntryTitleAndSubtitle(chunk: string[]): {
    title?: string;
    subtitle?: string;
    descriptionLines: string[];
  } {
    const titleLine = chunk[0] ?? '';
    const titleLineWithoutDates = titleLine.replace(DATE_RANGE_RE, '').trim();
    const separatorParts = titleLineWithoutDates
      .split(/\s*[-|@]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (separatorParts.length >= 2) {
      // Format A — everything needed is already on line 1.
      return {
        title: separatorParts[0],
        subtitle: separatorParts[1],
        descriptionLines: chunk.slice(1),
      };
    }

    const secondLine = chunk[1];
    const thirdLine = chunk[2];
    // A PDF-wrapped bullet's first physical line ("Apoio na elaboração e
    // monitorização de orçamentos operacionais") can itself look exactly
    // like a short, capitalized, unpunctuated "title" line — the giveaway
    // is that the line *after* it continues the sentence in lowercase
    // ("para o departamento..."), which a genuine second title line never
    // does (what follows a real title is either a date or another
    // capitalized line). Confirmed against a real failing import.
    // A trailing bare comma is a second, independent wrapped-bullet
    // giveaway (see chunkEntries()'s isShortCapitalizedNonSentence) — a
    // real title never structurally ends with one.
    const thirdLineContinuesLowercase = thirdLine != null && /^[a-zà-öø-ÿ]/.test(thirdLine.trim());
    const secondLineLooksLikeATitle =
      secondLine != null &&
      secondLine.length <= 70 &&
      /^[A-Z]/.test(secondLine) &&
      !DATE_RANGE_RE.test(secondLine) &&
      !/[.!?,]$/.test(secondLine.trim()) &&
      !thirdLineContinuesLowercase;

    if (titleLineWithoutDates && secondLineLooksLikeATitle) {
      // Format B — line 1 is "date + subtitle", line 2 is the real title.
      return {
        title: secondLine,
        subtitle: titleLineWithoutDates,
        descriptionLines: chunk.slice(2),
      };
    }

    // Fallback — exactly the original one-line-only behavior.
    return {
      title: titleLineWithoutDates || undefined,
      subtitle: undefined,
      descriptionLines: chunk.slice(1),
    };
  }

  private parseDateRange(text: string): {
    startDate?: string;
    endDate?: string;
    currentlyWorking: boolean;
  } {
    const match = text.match(DATE_RANGE_RE);
    const startRaw = match?.[1];
    const endRaw = match?.[2];
    if (!startRaw || !endRaw) return { currentlyWorking: false };
    const currentlyWorking = CURRENT_MARKERS.some((m) => endRaw.toLowerCase().includes(m));
    return {
      startDate: this.toIsoDate(startRaw),
      endDate: currentlyWorking ? undefined : this.toIsoDate(endRaw),
      currentlyWorking,
    };
  }

  private toIsoDate(raw: string): string | undefined {
    const trimmed = raw.trim().replace(/\.$/, '');
    const monthYear = trimmed.match(/^([a-zA-Zçãáéíóõâêô]+)\.?\s*\/?\s*(\d{4})$/);
    const monthName = monthYear?.[1];
    const monthYearYear = monthYear?.[2];
    if (monthName && monthYearYear) {
      const monthKey = monthName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const month = MONTHS[monthKey];
      if (month !== undefined) {
        return `${monthYearYear}-${String(month + 1).padStart(2, '0')}-01`;
      }
    }
    const numeric = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
    const numericMonth = numeric?.[1];
    const numericYear = numeric?.[2];
    if (numericMonth && numericYear) {
      return `${numericYear}-${numericMonth.padStart(2, '0')}-01`;
    }
    const yearOnly = trimmed.match(/^(\d{4})$/)?.[1];
    if (yearOnly) {
      return `${yearOnly}-01-01`;
    }
    return undefined;
  }

  private parseExperience(lines: string[]): ExtractedWorkExperience[] {
    return this.chunkEntries(lines).map((chunk): ExtractedWorkExperience => {
      const { startDate, endDate, currentlyWorking } = this.parseDateRange(chunk.join(' '));
      const { title, subtitle, descriptionLines } = this.splitEntryTitleAndSubtitle(chunk);
      const description = descriptionLines.join(' ').trim() || undefined;
      const { confidence, warnings } = scoreWorkExperience({
        company: subtitle,
        position: title,
        startDate,
        endDate,
        currentlyWorking,
        description,
      });
      return {
        position: title,
        company: subtitle,
        startDate,
        endDate,
        currentlyWorking,
        description,
        confidence,
        source: 'document',
        sourceText: buildSourceText(chunk),
        warnings,
      };
    });
  }

  private parseEducation(lines: string[]): ExtractedEducation[] {
    return this.chunkEntries(lines).map((chunk): ExtractedEducation => {
      const { startDate, endDate } = this.parseDateRange(chunk.join(' '));
      const { title, subtitle, descriptionLines } = this.splitEntryTitleAndSubtitle(chunk);
      const description = descriptionLines.join(' ').trim() || undefined;
      const { confidence, warnings } = scoreEducation({
        institution: title,
        degree: subtitle,
        startDate,
        description,
      });
      return {
        institution: title,
        degree: subtitle,
        startDate,
        endDate,
        description,
        confidence,
        source: 'document',
        sourceText: buildSourceText(chunk),
        warnings,
      };
    });
  }

  private parseSkills(lines: string[]): ExtractedSkill[] {
    const tokens = lines
      .join(', ')
      .split(/[,;•·|]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 40);
    const unique = [...new Set(tokens)];
    return unique.map((name) => {
      const { confidence, warnings } = scoreSkill(name);
      return { name, confidence, source: 'document', warnings };
    });
  }

  private parseLanguages(lines: string[]): ExtractedLanguage[] {
    const tokens = lines
      .join(', ')
      .split(/[,;•·]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return tokens.map((token) => {
      const match = token.match(/^(.+?)\s*[(\-:]\s*([a-zA-Zçãáéíóõâêô ]+?)\)?$/);
      const languagePart = match?.[1];
      const proficiencyPart = match?.[2];
      const entry =
        languagePart && proficiencyPart
          ? { language: languagePart.trim(), proficiency: proficiencyPart.trim() }
          : { language: token };
      const { confidence, warnings } = scoreLanguage(entry);
      return { ...entry, confidence, source: 'document' as const, warnings };
    });
  }

  private parseCertificates(lines: string[]): ExtractedCertificate[] {
    return this.chunkEntries(lines).map((chunk): ExtractedCertificate => {
      const titleLine = chunk[0] ?? '';
      const { startDate } = this.parseDateRange(chunk.join(' '));
      const withoutDate = titleLine.replace(DATE_RANGE_RE, '').trim();
      const [title, issuer] = withoutDate.split(/\s*[-|@]\s*/).map((s) => s.trim());
      const entryTitle = title || withoutDate || undefined;
      const { confidence, warnings } = scoreCertificate({
        title: entryTitle,
        issuer,
        issueDate: startDate,
      });
      return {
        title: entryTitle,
        issuer,
        issueDate: startDate,
        confidence,
        source: 'document',
        sourceText: buildSourceText(chunk),
        warnings,
      };
    });
  }

  private parseProjects(lines: string[]): ExtractedProject[] {
    return this.chunkEntries(lines).map((chunk): ExtractedProject => {
      const titleLine = chunk[0] ?? '';
      const url = titleLine.match(GENERIC_URL_RE)?.[0];
      const title =
        titleLine
          .replace(GENERIC_URL_RE, '')
          .replace(/[-|]\s*$/, '')
          .trim() || undefined;
      const description = chunk.slice(1).join(' ').trim() || undefined;
      const { confidence, warnings } = scoreProject({ title, description, url });
      return {
        title,
        url,
        description,
        confidence,
        source: 'document',
        sourceText: buildSourceText(chunk),
        warnings,
      };
    });
  }

  /**
   * Phase 12 canonical-model addition — same title/issuer/date shape as
   * parseCertificates(), but awards (unlike experience/education) are
   * typically dated with a single year, not a range — DATE_RANGE_RE
   * deliberately never matches a bare year on its own (it would be far too
   * eager to misfire on any 4-digit number in body text), so a dedicated
   * leading-single-year strip is needed here to both clean the title and
   * populate dateAwarded for the common "2022 Employee of the Year" case.
   */
  private parseAwards(lines: string[]): ExtractedAward[] {
    const LEADING_YEAR_RE = /^(\d{4})\s+/;
    return this.chunkEntries(lines).map((chunk): ExtractedAward => {
      const titleLine = chunk[0] ?? '';
      const { startDate: rangeStartDate } = this.parseDateRange(chunk.join(' '));
      const leadingYear = titleLine.match(LEADING_YEAR_RE)?.[1];
      const withoutDate = titleLine.replace(DATE_RANGE_RE, '').replace(LEADING_YEAR_RE, '').trim();
      const [title, issuer] = withoutDate.split(/\s*[-|@]\s*/).map((s) => s.trim());
      const entryTitle = title || withoutDate || undefined;
      const dateAwarded = rangeStartDate ?? (leadingYear ? this.toIsoDate(leadingYear) : undefined);
      const description = chunk.slice(1).join(' ').trim() || undefined;
      const { confidence, warnings } = scoreAward({ title: entryTitle, issuer, dateAwarded });
      return {
        title: entryTitle,
        issuer,
        dateAwarded,
        description,
        confidence,
        source: 'document',
        sourceText: buildSourceText(chunk),
        warnings,
      };
    });
  }

  /** Phase 12 canonical-model addition — same entry shape as parseExperience(), just organization/role instead of company/position. */
  private parseVolunteerExperiences(lines: string[]): ExtractedVolunteerExperience[] {
    return this.chunkEntries(lines).map((chunk): ExtractedVolunteerExperience => {
      const { startDate, endDate, currentlyWorking } = this.parseDateRange(chunk.join(' '));
      const { title, subtitle, descriptionLines } = this.splitEntryTitleAndSubtitle(chunk);
      const description = descriptionLines.join(' ').trim() || undefined;
      const { confidence, warnings } = scoreVolunteer({
        organization: subtitle,
        role: title,
        startDate,
        description,
      });
      return {
        role: title,
        organization: subtitle,
        startDate,
        endDate,
        currentlyVolunteering: currentlyWorking,
        description,
        confidence,
        source: 'document',
        sourceText: buildSourceText(chunk),
        warnings,
      };
    });
  }

  /**
   * Phase 12 canonical-model addition. Per the brief: references are only
   * ever populated from an actual "Referências"/"References" block — never
   * fabricated. Each entry is anchored on an email or phone number found
   * within its chunk (the one field a reference listing reliably includes);
   * a chunk with neither is dropped rather than guessed at, consistent with
   * this module's "return null/uncertain rather than invent" rule.
   */
  private parseReferences(lines: string[]): ExtractedReference[] {
    return this.chunkEntries(lines)
      .map((chunk): ExtractedReference | undefined => {
        const joined = chunk.join(' ');
        const email = joined.match(EMAIL_RE)?.[0];
        const phone = this.extractPhone(joined);
        if (!email && !phone) return undefined;

        const nameLine = (chunk[0] ?? '').replace(EMAIL_RE, '').trim();
        const separatorParts = nameLine
          .split(/\s*[-|,]\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
        const [name, position, company] = separatorParts;
        const entryName = name || undefined;
        const { confidence, warnings } = scoreReference({
          name: entryName,
          email,
          phone,
          position,
          company,
        });
        return {
          name: entryName,
          position,
          company,
          email,
          phone,
          confidence,
          source: 'document',
          sourceText: buildSourceText(chunk),
          warnings,
        };
      })
      .filter((entry): entry is ExtractedReference => entry !== undefined);
  }
}

/**
 * FASE 8 (2026-08-12 audit) — cleans whitespace-only extraction artifacts
 * from a name-like field (company, position, institution, degree, title,
 * issuer, organization, role, person name, language) before it's persisted.
 * PDF/DOCX extraction routinely leaves behind doubled internal spaces or
 * stray newlines from column/tab spacing (e.g. "Beta  Consultoria,   Lda"),
 * which this collapses to single spaces and trims. Deliberately does
 * *nothing* else — no case changes, no reordering, no word removal — per
 * CLAUDE.md/the brief's "não alterar o significado original": this is
 * whitespace cleanup, never a rewrite. A value the parser never found
 * (undefined) stays undefined; a value that normalizes to empty also
 * becomes undefined rather than an empty string, matching every other
 * "not found" field in this module.
 */
export function normalizeEntityName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : undefined;
}
