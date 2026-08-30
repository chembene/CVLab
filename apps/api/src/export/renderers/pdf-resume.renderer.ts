import { existsSync } from 'fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Injectable, NotFoundException } from '@nestjs/common';
import puppeteer from 'puppeteer-core';
import { ResumeLayout, resolveTheme, type TemplateMetadata } from '@cvlab/resume-renderer';
import { ResumeTemplateRepository } from '../../template-engine/resume-template.repository';
import type {
  ResumeRenderer,
  ResumeRenderInput,
  ResumeRenderResult,
} from '../interfaces/resume-render-input.interface';

/** Mirrors apps/web's ResumePreview.tsx `DEFAULT_RESUME_TEMPLATE_ID` — "the safe, always-ATS-friendly default every Resume Variant renders with until the user explicitly picks one." */
const DEFAULT_RESUME_TEMPLATE_ID = 'ats-classic';

/**
 * No Chromium binary ships with `puppeteer-core` (deliberately — a bundled
 * download failed in this environment with no outbound network access, and
 * shipping a ~170MB browser per `npm install` is the wrong default for a
 * server deployment anyway). `PDF_CHROMIUM_PATH` is the one supported,
 * disclosed way to point this at a real Chrome/Chromium/Edge binary in any
 * environment; the local-dev fallback paths below are a convenience only,
 * never relied on in production. See docs/architecture/export-engine.md
 * "PDF Rendering".
 */
function resolveChromiumExecutablePath(): string {
  const configured = process.env.PDF_CHROMIUM_PATH;
  if (configured) {
    return configured;
  }
  const devFallbackCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  const found = devFallbackCandidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      'No Chromium/Chrome/Edge executable found for PDF export. Set the PDF_CHROMIUM_PATH environment variable.',
    );
  }
  return found;
}

/**
 * PDF Rendering — the pipeline the approved design requires:
 *   ResumeVariant/Version content → resolved Template + ResolvedTheme
 *   → the *exact same* <ResumeLayout> component apps/web's live preview
 *     renders, server-rendered via react-dom/server (no second template
 *     implementation, no PDFKit hand-drawing) → a minimal HTML shell
 *   → headless Chromium (puppeteer-core) → page.pdf() → Buffer
 *
 * A fresh browser is launched and closed per export (simpler and safer to
 * reason about than a shared/pooled browser instance across requests — see
 * docs/architecture/export-engine.md "Known limitations" for the
 * performance trade-off this accepts).
 */
@Injectable()
export class PdfResumeRenderer implements ResumeRenderer {
  constructor(private readonly templateRepository: ResumeTemplateRepository) {}

  async render(input: ResumeRenderInput): Promise<ResumeRenderResult> {
    const template = await this.resolveTemplate(input.templateId);
    const theme = resolveTheme(template, input.themeOverrides);
    const html = this.renderHtmlDocument(input, theme, template.supportedSections);

    const browser = await puppeteer.launch({
      executablePath: resolveChromiumExecutablePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      const pdfBytes = await page.pdf({ format: 'A4', printBackground: true, timeout: 30000 });
      return {
        buffer: Buffer.from(pdfBytes),
        fileName: 'curriculo.pdf',
        contentType: 'application/pdf',
      };
    } finally {
      await browser.close();
    }
  }

  /** Same fallback the frontend's own ResumePreview.tsx uses — an inactive/deleted templateId is treated as "not found", never silently swapped for the default (that would render something the user didn't ask for). */
  private async resolveTemplate(templateId: string | null): Promise<TemplateMetadata> {
    const id = templateId ?? DEFAULT_RESUME_TEMPLATE_ID;
    const template = await this.templateRepository.findById(id);
    if (!template) {
      throw new NotFoundException(`Resume template "${id}" not found.`);
    }
    return template;
  }

  private renderHtmlDocument(
    input: ResumeRenderInput,
    theme: ReturnType<typeof resolveTheme>,
    supportedSections: string[],
  ): string {
    const body = renderToStaticMarkup(
      createElement(ResumeLayout, {
        content: input.content,
        profile: input.profile,
        theme,
        supportedSections,
      }),
    );
    // Inline styles carry all visual styling (see @cvlab/resume-renderer) —
    // this shell only needs a charset and a zero-margin body so the
    // renderer's own page padding (theme.spacing.pageMargin) is the only
    // margin applied.
    return `<!doctype html><html><head><meta charset="utf-8" /><title>Currículo</title></head><body style="margin:0">${body}</body></html>`;
  }
}
