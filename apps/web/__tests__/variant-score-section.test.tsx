import { fireEvent, screen, waitFor } from '@testing-library/react';
import { VariantScoreSection } from '../components/resume-variants/variant-score-section';
import { renderWithQueryClient } from '../lib/test-utils';
import type { AtsReport } from '../lib/api/ats';

function mockFetchSequence(bodies: { body: unknown; status?: number }[]): jest.Mock {
  const mock = jest.fn();
  for (const { body, status = 200 } of bodies) {
    mock.mockResolvedValueOnce({ status, json: async () => body });
  }
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function makeReport(overrides: Partial<AtsReport> = {}): AtsReport {
  return {
    id: 'report-1',
    userId: 'user-1',
    resumeVariantId: 'variant-1',
    jobTargetId: 'job-1',
    overallScore: 72,
    keywordScore: 60,
    skillsScore: 80,
    experienceScore: 100,
    educationScore: 70,
    languageScore: 100,
    formattingScore: 80,
    completionScore: 90,
    matchedKeywords: ['React'],
    missingKeywords: ['Node.js'],
    recommendedSkills: ['Docker'],
    recommendations: ['Complete a sua secção de Formação.'],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('VariantScoreSection', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a prompt to link a job target when the variant has none', async () => {
    mockFetchSequence([{ body: { success: true, data: [] } }]);
    renderWithQueryClient(<VariantScoreSection variantId="variant-1" jobTargetId={null} />);
    expect(await screen.findByText(/Associe esta versão a uma vaga/)).toBeInTheDocument();
  });

  it('prompts to run an analysis when none exists yet for this variant', async () => {
    mockFetchSequence([{ body: { success: true, data: [] } }]);
    renderWithQueryClient(<VariantScoreSection variantId="variant-1" jobTargetId="job-1" />);
    expect(await screen.findByText(/Ainda não executou nenhuma análise ATS/)).toBeInTheDocument();
  });

  it('renders the most recent report scoped to this variant, ignoring others', async () => {
    mockFetchSequence([
      {
        body: {
          success: true,
          data: [
            makeReport({ id: 'other', resumeVariantId: 'variant-2', overallScore: 10 }),
            makeReport({ id: 'older', overallScore: 40, createdAt: '2026-07-01T00:00:00.000Z' }),
            makeReport({ id: 'latest', overallScore: 72, createdAt: '2026-08-01T00:00:00.000Z' }),
          ],
        },
      },
    ]);
    renderWithQueryClient(<VariantScoreSection variantId="variant-1" jobTargetId="job-1" />);

    await waitFor(() => expect(screen.getByText('72')).toBeInTheDocument());
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
    expect(screen.getByText('Complete a sua secção de Formação.')).toBeInTheDocument();
  });

  it('runs a new analysis for this variant when the button is clicked', async () => {
    const mock = mockFetchSequence([
      { body: { success: true, data: [] } },
      { body: { success: true, data: makeReport() } },
      { body: { success: true, data: [makeReport()] } },
    ]);
    renderWithQueryClient(<VariantScoreSection variantId="variant-1" jobTargetId="job-1" />);
    await waitFor(() => expect(screen.getByText(/Ainda não executou/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Executar análise ATS/ }));

    await waitFor(() => {
      const [, init] = mock.mock.calls[1] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ resumeVariantId: 'variant-1' });
    });
  });
});
