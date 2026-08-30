import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders children and responds to click', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled while loading and shows a spinner', () => {
    render(<Button loading>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Button disabled>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('renders a single child element via asChild without wrapping it in a <button>', () => {
    render(
      <Button asChild>
        <a href="/dashboard">Ir para o painel</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Ir para o painel' });
    expect(link).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('applies the destructive variant class', () => {
    render(<Button variant="destructive">Eliminar</Button>);
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveClass('bg-destructive');
  });
});
