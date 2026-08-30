jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
}));

import { existsSync } from 'fs';
import { NotFoundException } from '@nestjs/common';
import puppeteer from 'puppeteer-core';
import { PdfResumeRenderer } from './pdf-resume.renderer';
import type { ResumeTemplateRepository } from '../../template-engine/resume-template.repository';

// The factories above create their own jest.fn() internally — referencing
// an externally-declared mock variable from inside a jest.mock() factory
// hits a TDZ ReferenceError under ts-jest (no babel-plugin-jest-hoist
// pass), since `fs`/`puppeteer-core` are required transitively the moment
// `./pdf-resume.renderer` is imported below. Grabbing typed references to
// the already-created mocks afterward sidesteps that entirely.
const mockLaunch = puppeteer.launch as jest.Mock;
const mockExistsSync = existsSync as jest.Mock;

describe('PdfResumeRenderer', () => {
  let templateRepository: jest.Mocked<ResumeTemplateRepository>;
  let renderer: PdfResumeRenderer;

  const template = {
    id: 'ats-classic',
    layout: 'single-column',
    primaryColor: '#111827',
    secondaryColor: '#374151',
    font: 'Inter',
    supportedSections: ['summary', 'workExperiences', 'skills'],
  };

  const input = {
    content: { summary: 'Backend engineer.', workExperiences: [], skills: [] },
    profile: { displayName: 'Ana Machava', email: 'ana@example.com' },
    templateId: 'ats-classic',
    themeOverrides: null,
  };

  beforeEach(() => {
    templateRepository = {
      findById: jest.fn().mockResolvedValue(template),
    } as unknown as jest.Mocked<ResumeTemplateRepository>;
    renderer = new PdfResumeRenderer(templateRepository);
    process.env.PDF_CHROMIUM_PATH = 'C:\\fake\\chrome.exe';
    mockLaunch.mockReset();
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    delete process.env.PDF_CHROMIUM_PATH;
  });

  function mockBrowser(pdfImpl: () => Promise<Uint8Array>) {
    const close = jest.fn().mockResolvedValue(undefined);
    const setContent = jest.fn().mockResolvedValue(undefined);
    const pdf = jest.fn(pdfImpl);
    const newPage = jest.fn().mockResolvedValue({ setContent, pdf });
    mockLaunch.mockResolvedValue({ newPage, close });
    return { close, setContent, pdf, newPage };
  }

  it('resolves the given templateId, falling back to "ats-classic" only when none is supplied', async () => {
    mockBrowser(async () => new Uint8Array([1, 2, 3]));
    await renderer.render({ ...input, templateId: null });
    expect(templateRepository.findById).toHaveBeenCalledWith('ats-classic');
  });

  it('throws NotFoundException when the templateId does not resolve to an active template', async () => {
    templateRepository.findById.mockResolvedValue(null);
    await expect(renderer.render(input)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('launches Chromium with the configured executable path, renders the shared ResumeLayout to HTML, and returns a PDF buffer', async () => {
    const { setContent, pdf, close } = mockBrowser(
      async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    );

    const result = await renderer.render(input);

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: 'C:\\fake\\chrome.exe', headless: true }),
    );
    const html = setContent.mock.calls[0]![0] as string;
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Backend engineer.'); // the actual résumé content, server-rendered
    expect(html).toContain('Ana Machava'); // HeaderRenderer's profile name
    expect(pdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'A4', printBackground: true }),
    );
    expect(result.contentType).toBe('application/pdf');
    expect(result.fileName).toBe('curriculo.pdf');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('still closes the browser, and propagates the error, when page.pdf() fails', async () => {
    const failure = new Error('Chromium crashed.');
    const { close } = mockBrowser(async () => {
      throw failure;
    });

    await expect(renderer.render(input)).rejects.toBe(failure);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when PDF_CHROMIUM_PATH is unset and none of the dev-fallback paths exist', async () => {
    delete process.env.PDF_CHROMIUM_PATH;
    mockExistsSync.mockReturnValue(false);

    await expect(renderer.render(input)).rejects.toThrow(
      'No Chromium/Chrome/Edge executable found',
    );
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('falls back to a detected dev Chrome/Edge install when PDF_CHROMIUM_PATH is unset', async () => {
    delete process.env.PDF_CHROMIUM_PATH;
    mockExistsSync.mockImplementation((candidate: string) => candidate.includes('Google\\Chrome'));
    mockBrowser(async () => new Uint8Array([1]));

    await renderer.render(input);

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: expect.stringContaining('Google\\Chrome') }),
    );
  });
});
