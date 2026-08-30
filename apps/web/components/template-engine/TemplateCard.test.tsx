import { fireEvent, render, screen } from '@testing-library/react';
import { TemplateCard } from './TemplateCard';
import type { TemplateMetadata } from '@/lib/api/templates';

function makeTemplate(overrides: Partial<TemplateMetadata> = {}): TemplateMetadata {
  return {
    id: 'modern',
    name: 'Modern',
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
    supportedSections: [],
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('TemplateCard', () => {
  it('shows an ATS-friendly badge for ATS-friendly templates', () => {
    render(
      <TemplateCard
        template={makeTemplate({ isATSFriendly: true })}
        selected={false}
        favorited={false}
        onSelect={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(screen.getByText('Compatível com ATS')).toBeInTheDocument();
  });

  it('shows a visual-focus badge instead when the template is not ATS-friendly', () => {
    render(
      <TemplateCard
        template={makeTemplate({ isATSFriendly: false })}
        selected={false}
        favorited={false}
        onSelect={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(screen.getByText('Foco visual')).toBeInTheDocument();
    expect(screen.queryByText('Compatível com ATS')).not.toBeInTheDocument();
  });

  it('shows a Premium badge only for premium templates', () => {
    const { rerender } = render(
      <TemplateCard
        template={makeTemplate({ premium: true })}
        selected={false}
        favorited={false}
        onSelect={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(screen.getByText('Premium')).toBeInTheDocument();

    rerender(
      <TemplateCard
        template={makeTemplate({ premium: false })}
        selected={false}
        favorited={false}
        onSelect={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(screen.queryByText('Premium')).not.toBeInTheDocument();
  });

  it('calls onSelect with the template id when the select button is clicked', () => {
    const onSelect = jest.fn();
    render(
      <TemplateCard
        template={makeTemplate({ id: 'executive' })}
        selected={false}
        favorited={false}
        onSelect={onSelect}
        onToggleFavorite={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Usar este modelo' }));
    expect(onSelect).toHaveBeenCalledWith('executive');
  });

  it('shows "Selecionado" and does not re-fire onSelect needlessly when already selected', () => {
    render(
      <TemplateCard
        template={makeTemplate()}
        selected
        favorited={false}
        onSelect={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Selecionado' })).toBeInTheDocument();
  });

  it('calls onToggleFavorite with the current favorited state, not the toggled one', () => {
    const onToggleFavorite = jest.fn();
    render(
      <TemplateCard
        template={makeTemplate({ id: 'creative' })}
        selected={false}
        favorited={false}
        onSelect={jest.fn()}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar aos favoritos' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('creative', false);
  });

  it('exposes the opposite aria-label + pressed state once favorited', () => {
    render(
      <TemplateCard
        template={makeTemplate()}
        selected={false}
        favorited
        onSelect={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    const favoriteButton = screen.getByRole('button', { name: 'Remover dos favoritos' });
    expect(favoriteButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onPreview (not onSelect/onToggleFavorite) when the thumbnail is clicked', () => {
    const onPreview = jest.fn();
    render(
      <TemplateCard
        template={makeTemplate({ id: 'elegant' })}
        selected={false}
        favorited={false}
        onSelect={jest.fn()}
        onPreview={onPreview}
        onToggleFavorite={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Pré-visualizar/ }));
    expect(onPreview).toHaveBeenCalledWith('elegant');
  });
});
