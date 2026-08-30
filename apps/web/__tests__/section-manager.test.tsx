import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { SectionManager } from '../components/section-manager';
import { SECTION_CONFIGS } from '../lib/section-fields';
import { renderWithQueryClient } from '../lib/test-utils';

function mockFetchSequence(bodies: { body: unknown; status?: number }[]): jest.Mock {
  const mock = jest.fn();
  for (const { body, status = 200 } of bodies) {
    mock.mockResolvedValueOnce({ status, json: async () => body });
  }
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

const skillsConfig = SECTION_CONFIGS.skills;

describe('SectionManager', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows an empty state when there are no items', async () => {
    mockFetchSequence([{ body: { success: true, data: [] } }]);
    renderWithQueryClient(<SectionManager config={skillsConfig} />);
    await waitFor(() =>
      expect(screen.getByText(/Ainda não adicionou nenhuma competência/)).toBeInTheDocument(),
    );
  });

  it('lists existing items ordered by displayOrder', async () => {
    mockFetchSequence([
      {
        body: {
          success: true,
          data: [
            { id: '2', displayOrder: 1, name: 'Node.js' },
            { id: '1', displayOrder: 0, name: 'TypeScript' },
          ],
        },
      },
    ]);
    renderWithQueryClient(<SectionManager config={skillsConfig} />);
    const items = await screen.findAllByText(/TypeScript|Node\.js/);
    expect(items.map((el) => el.textContent)).toEqual(['TypeScript', 'Node.js']);
  });

  it('adds a new item through the dialog form', async () => {
    const mock = mockFetchSequence([
      { body: { success: true, data: [] } },
      { body: { success: true, data: { id: '1', displayOrder: 0, name: 'TypeScript' } } },
      { body: { success: true, data: [{ id: '1', displayOrder: 0, name: 'TypeScript' }] } },
    ]);
    renderWithQueryClient(<SectionManager config={skillsConfig} />);
    await waitFor(() =>
      expect(screen.getByText(/Ainda não adicionou nenhuma competência/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    fireEvent.change(await screen.findByLabelText(/Nome/), { target: { value: 'TypeScript' } });

    await act(async () => {
      screen.getByRole('button', { name: 'Guardar' }).click();
    });

    await waitFor(() => expect(mock.mock.calls[1]?.[1].method).toBe('POST'));
    await waitFor(() => expect(screen.getByText('TypeScript')).toBeInTheDocument());
  });

  it('removes an item after confirming in the dialog', async () => {
    mockFetchSequence([
      { body: { success: true, data: [{ id: '1', displayOrder: 0, name: 'TypeScript' }] } },
      { body: { success: true, data: null } },
      { body: { success: true, data: [] } },
    ]);
    renderWithQueryClient(<SectionManager config={skillsConfig} />);
    await waitFor(() => expect(screen.getByText('TypeScript')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Remover' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() =>
      expect(screen.getByText(/Ainda não adicionou nenhuma competência/)).toBeInTheDocument(),
    );
  });
});
