import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { AuthProvider } from './auth-context';

/** Fresh QueryClient per render — no caching/retries across tests, no delay on error paths. */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  });
}

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

/** Renders with QueryClientProvider + AuthProvider — the same provider stack app/layout.tsx wraps every page in, minus ThemeProvider (irrelevant to jsdom assertions) and the Toaster (tests assert on toast() calls via the sonner mock instead, see jest.setup.ts). Use for components/pages that call useAuth() — AuthProvider fires its own POST /auth/refresh on mount, which a fetch-mock sequence must account for as call #1. */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options });
}

function QueryOnlyProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

/** Renders with QueryClientProvider only, no AuthProvider — for components that don't call useAuth(), so a fetch-mock sequence doesn't need to account for AuthProvider's mount-time session-restore call. */
export function renderWithQueryClient(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: QueryOnlyProvider, ...options });
}

export * from '@testing-library/react';
