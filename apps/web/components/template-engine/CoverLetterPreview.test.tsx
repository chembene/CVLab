import { screen, waitFor } from '@testing-library/react';
import { CoverLetterPreview, DEFAULT_COVER_LETTER_TEMPLATE_ID } from './CoverLetterPreview';
import { renderWithQueryClient } from '@/lib/test-utils';
import type { TemplateMetadata } from '@/lib/api/templates';

function templateResponse(id: string, overrides: Partial<TemplateMetadata> = {}) {
  const data: TemplateMetadata = {
    id,
    name: id,
    category: 'MODERN',
    previewImage: null,
    thumbnail: null,
    isATSFriendly: true,
    premium: false,
    version: 1,
    primaryColor: '#111827',
    secondaryColor: '#374151',
    font: 'Inter',
    layout: 'letter-classic',
    supportedSections: [],
    status: 'ACTIVE',
    ...overrides,
  };
  return { status: 200, json: async () => ({ success: true, data }) };
}

function mockFetchOnce(response: unknown) {
  global.fetch = jest.fn().mockResolvedValueOnce(response) as unknown as typeof fetch;
  return global.fetch as jest.Mock;
}

describe('CoverLetterPreview', () => {
  afterEach(() => jest.restoreAllMocks());

  it('falls back to the default cover-letter template when none is selected', async () => {
    const fetchMock = mockFetchOnce(templateResponse(DEFAULT_COVER_LETTER_TEMPLATE_ID));
    renderWithQueryClient(
      <CoverLetterPreview title="Candidatura" body="Prezado recrutador," templateId={null} />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/templates/cover-letter/${DEFAULT_COVER_LETTER_TEMPLATE_ID}`),
      expect.anything(),
    );
    expect(await screen.findByText('Prezado recrutador,')).toBeInTheDocument();
  });

  it('Part 5 live preview: templateIdOverride wins over the persisted templateId', async () => {
    const fetchMock = mockFetchOnce(templateResponse('cl-startup'));
    renderWithQueryClient(
      <CoverLetterPreview
        title="Candidatura"
        body="Corpo da carta"
        templateId="cl-professional"
        templateIdOverride="cl-startup"
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/templates/cover-letter/cl-startup'),
      expect.anything(),
    );
  });

  it('shows an error message (not a stuck skeleton) when the template fetch fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      status: 404,
      json: async () => ({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Modelo não encontrado.' },
      }),
    }) as unknown as typeof fetch;

    renderWithQueryClient(
      <CoverLetterPreview title="Candidatura" body="Corpo" templateId="does-not-exist" />,
    );

    await waitFor(() =>
      expect(
        screen.getByText('Não foi possível carregar o modelo selecionado.'),
      ).toBeInTheDocument(),
    );
  });
});
