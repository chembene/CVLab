import { screen, waitFor } from '@testing-library/react';
import { ResumePreview, DEFAULT_RESUME_TEMPLATE_ID } from './ResumePreview';
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
    layout: 'single-column',
    supportedSections: ['summary'],
    status: 'ACTIVE',
    ...overrides,
  };
  return { status: 200, json: async () => ({ success: true, data }) };
}

function mockFetchOnce(response: unknown) {
  global.fetch = jest.fn().mockResolvedValueOnce(response) as unknown as typeof fetch;
  return global.fetch as jest.Mock;
}

describe('ResumePreview', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fetches the persisted templateId when no live override is set', async () => {
    const fetchMock = mockFetchOnce(templateResponse('modern'));
    renderWithQueryClient(<ResumePreview content={{ summary: 'Olá' }} templateId="modern" />);

    await waitFor(() => expect(screen.getByText('Olá')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/templates/resume/modern'),
      expect.anything(),
    );
  });

  it('falls back to the safe ATS-friendly default when no template is selected at all', async () => {
    const fetchMock = mockFetchOnce(templateResponse(DEFAULT_RESUME_TEMPLATE_ID));
    renderWithQueryClient(<ResumePreview content={{}} templateId={null} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/templates/resume/${DEFAULT_RESUME_TEMPLATE_ID}`),
      expect.anything(),
    );
  });

  it('Part 5 live preview: templateIdOverride takes precedence over the persisted templateId', async () => {
    const fetchMock = mockFetchOnce(templateResponse('creative'));
    renderWithQueryClient(
      <ResumePreview content={{}} templateId="modern" templateIdOverride="creative" />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/templates/resume/creative'),
      expect.anything(),
    );
  });

  it('Part 5/6 live preview: themeOverridesOverride (unsaved edits) wins over the persisted themeOverrides', async () => {
    mockFetchOnce(templateResponse('modern'));
    renderWithQueryClient(
      <ResumePreview
        content={{ summary: 'Resumo de teste' }}
        templateId="modern"
        themeOverrides={{ primaryColor: '#000000' }}
        themeOverridesOverride={{ primaryColor: '#ABCDEF' }}
      />,
    );

    // SectionShell colors its heading with theme.colors.primary — the live,
    // unsaved override must be what actually renders, not the persisted value.
    const heading = await screen.findByText('Resumo Profissional');
    expect(heading).toHaveStyle({ color: '#ABCDEF' });
  });

  it('shows an error message when the template fetch fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      status: 404,
      json: async () => ({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Modelo não encontrado.' },
      }),
    }) as unknown as typeof fetch;

    renderWithQueryClient(<ResumePreview content={{}} templateId="does-not-exist" />);

    await waitFor(
      () =>
        expect(
          screen.getByText('Não foi possível carregar o modelo selecionado.'),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});
