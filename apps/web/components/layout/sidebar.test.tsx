import { render, screen } from '@testing-library/react';
import { Sidebar } from './sidebar';
import { NAV_GROUPS } from '@/lib/nav-items';

let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('Sidebar navigation', () => {
  it('renders every nav group and every nav item as a link', () => {
    mockPathname = '/dashboard';
    render(<Sidebar />);

    for (const group of NAV_GROUPS) {
      expect(screen.getByText(group.title)).toBeInTheDocument();
      for (const item of group.items) {
        expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
      }
    }
  });

  it('marks the link matching the current route as the current page', () => {
    mockPathname = '/dashboard/job-targets';
    render(<Sidebar />);

    expect(screen.getByRole('link', { name: 'Vagas Alvo' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('marks a nested route (e.g. a detail page) as active on its parent link', () => {
    mockPathname = '/dashboard/job-targets/abc-123';
    render(<Sidebar />);

    expect(screen.getByRole('link', { name: 'Vagas Alvo' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('only marks the Dashboard root link active on an exact match', () => {
    mockPathname = '/dashboard/profile';
    render(<Sidebar />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('aria-current', 'page');
  });
});
