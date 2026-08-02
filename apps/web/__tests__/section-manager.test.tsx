import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SectionManager } from '../components/section-manager';
import { SECTION_CONFIGS } from '../lib/section-fields';

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
    render(<SectionManager config={skillsConfig} />);
    await waitFor(() =>
      expect(screen.getByText('Ainda não adicionou nenhum item.')).toBeInTheDocument(),
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
    render(<SectionManager config={skillsConfig} />);
    const items = await screen.findAllByText(/TypeScript|Node\.js/);
    expect(items.map((el) => el.textContent)).toEqual(['TypeScript', 'Node.js']);
  });

  it('adds a new item through the add form', async () => {
    const mock = mockFetchSequence([
      { body: { success: true, data: [] } },
      { body: { success: true, data: { id: '1', displayOrder: 0, name: 'TypeScript' } } },
      { body: { success: true, data: [{ id: '1', displayOrder: 0, name: 'TypeScript' }] } },
    ]);
    render(<SectionManager config={skillsConfig} />);
    await waitFor(() =>
      expect(screen.getByText('Ainda não adicionou nenhum item.')).toBeInTheDocument(),
    );

    await act(async () => {
      screen.getByRole('button', { name: /Adicionar competência/i }).click();
    });

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'TypeScript' } });

    await act(async () => {
      screen.getByRole('button', { name: 'Adicionar' }).click();
    });

    await waitFor(() => expect(mock.mock.calls[1][1].method).toBe('POST'));
    await waitFor(() => expect(screen.getByText('TypeScript')).toBeInTheDocument());
  });

  it('removes an item after confirming', async () => {
    window.confirm = jest.fn().mockReturnValue(true);
    const mock = mockFetchSequence([
      { body: { success: true, data: [{ id: '1', displayOrder: 0, name: 'TypeScript' }] } },
      { body: { success: true, data: null } },
      { body: { success: true, data: [] } },
    ]);
    render(<SectionManager config={skillsConfig} />);
    await waitFor(() => expect(screen.getByText('TypeScript')).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: 'Remover' }).click();
    });

    await waitFor(() => expect(mock.mock.calls[1][1].method).toBe('DELETE'));
    await waitFor(() =>
      expect(screen.getByText('Ainda não adicionou nenhum item.')).toBeInTheDocument(),
    );
  });
});
