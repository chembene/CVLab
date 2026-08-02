import { act, render, screen, waitFor } from '@testing-library/react';
import ProfilePage from '../app/dashboard/profile/page';

function mockFetchSequence(bodies: { body: unknown; status?: number }[]): jest.Mock {
  const mock = jest.fn();
  for (const { body, status = 200 } of bodies) {
    mock.mockResolvedValueOnce({ status, json: async () => body });
  }
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('ProfilePage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads an empty form when no profile exists yet', async () => {
    mockFetchSequence([{ body: { success: true, data: null } }]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());
    expect(screen.getByLabelText('Nome')).toHaveValue('');
  });

  it('pre-fills the form with an existing profile', async () => {
    mockFetchSequence([
      {
        body: {
          success: true,
          data: { firstName: 'Maria', lastName: 'Chembe', headline: 'Engenheira de Software' },
        },
      },
    ]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Maria'));
    expect(screen.getByLabelText('Apelido')).toHaveValue('Chembe');
  });

  it('saves the profile and shows a success message', async () => {
    const mock = mockFetchSequence([
      { body: { success: true, data: null } },
      { body: { success: true, data: { firstName: 'Maria' } } },
    ]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: 'Guardar perfil' }).click();
    });

    await waitFor(() => expect(screen.getByText('Perfil guardado.')).toBeInTheDocument());
    expect(mock.mock.calls[1][1].method).toBe('PUT');
  });

  it('shows an error message when saving fails', async () => {
    mockFetchSequence([
      { body: { success: true, data: null } },
      {
        body: { success: false, error: { code: 'VALIDATION', message: 'Dados inválidos.' } },
        status: 400,
      },
    ]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: 'Guardar perfil' }).click();
    });

    await waitFor(() => expect(screen.getByText('Dados inválidos.')).toBeInTheDocument());
  });
});
