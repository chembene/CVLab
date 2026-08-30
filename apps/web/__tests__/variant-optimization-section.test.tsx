import { fireEvent, screen, waitFor } from '@testing-library/react';
import { OptimizationStatus, SuggestionPriority, SuggestionType } from '@cvlab/types';
import { VariantOptimizationSection } from '../components/resume-variants/variant-optimization-section';
import { renderWithQueryClient } from '../lib/test-utils';
import type { ResumeOptimization } from '../lib/api/resume-optimization';

function mockFetchSequence(bodies: { body: unknown; status?: number }[]): jest.Mock {
  const mock = jest.fn();
  for (const { body, status = 200 } of bodies) {
    mock.mockResolvedValueOnce({ status, json: async () => body });
  }
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function makeOptimization(overrides: Partial<ResumeOptimization> = {}): ResumeOptimization {
  return {
    id: 'opt-1',
    userId: 'user-1',
    resumeVariantId: 'variant-1',
    jobTargetId: 'job-1',
    atsReportId: 'report-1',
    status: OptimizationStatus.COMPLETED,
    creditsUsed: 80,
    beforeScore: 60,
    predictedScore: 85,
    summary: 'Reforce as suas conquistas quantificadas.',
    suggestions: [
      {
        id: 'sug-1',
        optimizationId: 'opt-1',
        type: SuggestionType.SUMMARY,
        section: 'summary',
        title: 'Melhore o resumo profissional',
        reason: 'O resumo atual é genérico.',
        priority: SuggestionPriority.HIGH,
        originalText: 'Profissional dedicado.',
        suggestedText: 'Profissional de atendimento com 5 anos de experiência.',
        accepted: false,
        applied: false,
        displayOrder: 0,
      },
    ],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('VariantOptimizationSection', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a prompt to link a job target when the variant has none', async () => {
    mockFetchSequence([{ body: { success: true, data: [] } }]);
    renderWithQueryClient(<VariantOptimizationSection variantId="variant-1" jobTargetId={null} />);
    expect(await screen.findByText(/Associe esta versão a uma vaga/)).toBeInTheDocument();
  });

  it('prompts to generate suggestions when none exist yet for this variant', async () => {
    mockFetchSequence([{ body: { success: true, data: [] } }]);
    renderWithQueryClient(<VariantOptimizationSection variantId="variant-1" jobTargetId="job-1" />);
    expect(await screen.findByText(/Ainda não gerou sugestões/)).toBeInTheDocument();
  });

  it('renders the most recent optimization scoped to this variant, ignoring others', async () => {
    mockFetchSequence([
      {
        body: {
          success: true,
          data: [
            makeOptimization({ id: 'other', resumeVariantId: 'variant-2' }),
            makeOptimization({ id: 'latest', beforeScore: 60, predictedScore: 85 }),
          ],
        },
      },
    ]);
    renderWithQueryClient(<VariantOptimizationSection variantId="variant-1" jobTargetId="job-1" />);

    expect(await screen.findByText('Melhore o resumo profissional')).toBeInTheDocument();
    expect(screen.getByText('Reforce as suas conquistas quantificadas.')).toBeInTheDocument();
  });

  it('applies selected suggestions and reports the new ATS score', async () => {
    const optimization = makeOptimization();
    const mock = mockFetchSequence([
      { body: { success: true, data: [optimization] } },
      {
        body: {
          success: true,
          data: {
            optimization: {
              ...optimization,
              suggestions: [{ ...optimization.suggestions[0]!, applied: true, accepted: true }],
            },
            appliedSuggestionIds: ['sug-1'],
            skippedSuggestionIds: [],
            newAtsReport: { overallScore: 88 },
          },
        },
      },
      { body: { success: true, data: [optimization] } },
      { body: { success: true, data: [optimization] } },
    ]);
    renderWithQueryClient(<VariantOptimizationSection variantId="variant-1" jobTargetId="job-1" />);

    await screen.findByText('Melhore o resumo profissional');
    fireEvent.click(screen.getByLabelText(/Selecionar sugestão: Melhore o resumo profissional/));
    fireEvent.click(screen.getByRole('button', { name: /Aplicar selecionadas/ }));

    await waitFor(() => {
      const [, init] = mock.mock.calls[1] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ suggestionIds: ['sug-1'] });
    });
  });
});
