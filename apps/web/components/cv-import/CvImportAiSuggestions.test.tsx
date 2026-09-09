import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { CvImportAiSuggestions } from './CvImportAiSuggestions';
import { renderWithQueryClient } from '@/lib/test-utils';
import type { CvImportAiSuggestion, ExtractedCvData } from '@/lib/api/cv-import';
import type { CreditEstimate } from '@/lib/api/career-advisor';

const reviewData: ExtractedCvData = {
  personalData: {},
  workExperiences: [{ company: 'TechCorp', position: 'Engineer' }],
  educations: [],
  skills: [],
  languages: [],
  certificates: [],
  projects: [],
  awards: [],
  volunteerExperiences: [],
  references: [],
};

function makeEstimate(overrides: Partial<CreditEstimate> = {}): CreditEstimate {
  return {
    featureKey: 'cv_import',
    cost: 30,
    currentBalance: 100,
    sufficientBalance: true,
    balanceAfter: 70,
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<CvImportAiSuggestion> = {}): CvImportAiSuggestion {
  return {
    section: 'workExperiences',
    index: 0,
    field: 'position',
    originalValue: 'Engineer',
    suggestedValue: 'Software Engineer',
    reason: 'More specific and standard title.',
    confidence: 0.8,
    ...overrides,
  };
}

function mockFetchByRoute(routes: {
  estimate: unknown;
  enhance?: { body: unknown; status?: number };
}): jest.Mock {
  const mock = jest.fn((url: string, init?: RequestInit) => {
    if (url.includes('/credits/estimate')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.estimate }),
      });
    }
    if (url.includes('/enhance') && init?.method === 'POST') {
      return Promise.resolve({
        status: routes.enhance?.status ?? 200,
        json: async () => routes.enhance?.body,
      });
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('CvImportAiSuggestions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the "Melhorar com IA" button with its live credit cost — never hardcoded', async () => {
    mockFetchByRoute({ estimate: makeEstimate({ cost: 30 }) });
    renderWithQueryClient(
      <CvImportAiSuggestions
        cvImportId="cvi-1"
        reviewData={reviewData}
        onChange={jest.fn()}
        aiSuggestions={null}
        aiUnresolvedFields={null}
        onEnhanced={jest.fn()}
      />,
    );

    expect(await screen.findByText('Custo: 30 créditos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Melhorar com IA/ })).toBeEnabled();
  });

  it('disables the button and shows a warning when the balance is insufficient', async () => {
    mockFetchByRoute({ estimate: makeEstimate({ sufficientBalance: false, currentBalance: 5 }) });
    renderWithQueryClient(
      <CvImportAiSuggestions
        cvImportId="cvi-1"
        reviewData={reviewData}
        onChange={jest.fn()}
        aiSuggestions={null}
        aiUnresolvedFields={null}
        onEnhanced={jest.fn()}
      />,
    );

    await screen.findByText(/Saldo insuficiente/);
    expect(screen.getByRole('button', { name: /Melhorar com IA/ })).toBeDisabled();
  });

  it('calls enhance and reports the result to the parent via onEnhanced', async () => {
    const onEnhanced = jest.fn();
    mockFetchByRoute({
      estimate: makeEstimate(),
      enhance: {
        body: {
          success: true,
          data: { id: 'cvi-1', aiSuggestions: [makeSuggestion()], aiUnresolvedFields: [] },
        },
      },
    });
    renderWithQueryClient(
      <CvImportAiSuggestions
        cvImportId="cvi-1"
        reviewData={reviewData}
        onChange={jest.fn()}
        aiSuggestions={null}
        aiUnresolvedFields={null}
        onEnhanced={onEnhanced}
      />,
    );

    await screen.findByText('Custo: 30 créditos');
    fireEvent.click(screen.getByRole('button', { name: /Melhorar com IA/ }));

    await waitFor(() => {
      expect(onEnhanced).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cvi-1', aiSuggestions: [makeSuggestion()] }),
      );
    });
  });

  it('shows an error toast when enhance fails', async () => {
    mockFetchByRoute({
      estimate: makeEstimate(),
      enhance: {
        body: { success: false, error: { message: 'Falha ao melhorar.', code: 'AI_ERROR' } },
        status: 500,
      },
    });
    renderWithQueryClient(
      <CvImportAiSuggestions
        cvImportId="cvi-1"
        reviewData={reviewData}
        onChange={jest.fn()}
        aiSuggestions={null}
        aiUnresolvedFields={null}
        onEnhanced={jest.fn()}
      />,
    );

    await screen.findByText('Custo: 30 créditos');
    fireEvent.click(screen.getByRole('button', { name: /Melhorar com IA/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Falha ao melhorar.');
    });
  });

  it('renders an empty state when suggestions ran but found nothing', () => {
    renderWithQueryClient(
      <CvImportAiSuggestions
        cvImportId="cvi-1"
        reviewData={reviewData}
        onChange={jest.fn()}
        aiSuggestions={[]}
        aiUnresolvedFields={[]}
        onEnhanced={jest.fn()}
      />,
    );
    expect(screen.getByText('Nada a melhorar')).toBeInTheDocument();
  });

  it('renders each suggestion with confidence, original (struck through) vs suggested value', () => {
    renderWithQueryClient(
      <CvImportAiSuggestions
        cvImportId="cvi-1"
        reviewData={reviewData}
        onChange={jest.fn()}
        aiSuggestions={[makeSuggestion()]}
        aiUnresolvedFields={[]}
        onEnhanced={jest.fn()}
      />,
    );

    expect(screen.getByText('Confiança alta')).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    expect(screen.getByText('More specific and standard title.')).toBeInTheDocument();
  });

  it('renders unresolvedFields notes', () => {
    renderWithQueryClient(
      <CvImportAiSuggestions
        cvImportId="cvi-1"
        reviewData={reviewData}
        onChange={jest.fn()}
        aiSuggestions={[]}
        aiUnresolvedFields={['Nome da empresa parece truncado.']}
        onEnhanced={jest.fn()}
      />,
    );
    expect(screen.getByText('Nome da empresa parece truncado.')).toBeInTheDocument();
  });

  it('accepting a suggestion applies it to reviewData via onChange and marks it "Aplicado"', () => {
    const onChange = jest.fn();
    renderWithQueryClient(
      <CvImportAiSuggestions
        cvImportId="cvi-1"
        reviewData={reviewData}
        onChange={onChange}
        aiSuggestions={[makeSuggestion()]}
        aiUnresolvedFields={[]}
        onEnhanced={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Aceitar/ }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        workExperiences: [expect.objectContaining({ position: 'Software Engineer' })],
      }),
    );
    expect(screen.getByText('Aplicado')).toBeInTheDocument();
  });

  it('rejecting a suggestion never calls onChange and marks it "Rejeitado"', () => {
    const onChange = jest.fn();
    renderWithQueryClient(
      <CvImportAiSuggestions
        cvImportId="cvi-1"
        reviewData={reviewData}
        onChange={onChange}
        aiSuggestions={[makeSuggestion()]}
        aiUnresolvedFields={[]}
        onEnhanced={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Rejeitar/ }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Rejeitado')).toBeInTheDocument();
  });
});
