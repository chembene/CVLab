import { render } from '@testing-library/react';
import { TemplateSwatch } from './TemplateSwatch';

describe('TemplateSwatch', () => {
  it('renders a header-band block when the layout is a *-header-band variant', () => {
    const { container } = render(
      <TemplateSwatch layout="header-band" primaryColor="#111827" secondaryColor="#374151" />,
    );
    const band = container.querySelector('rect[width="96"][height="22"]');
    expect(band).toBeInTheDocument();
    expect(band).toHaveAttribute('fill', '#111827');
  });

  it('renders a circular avatar + name/title bars for a non-band layout', () => {
    const { container } = render(
      <TemplateSwatch layout="single-column" primaryColor="#111827" secondaryColor="#374151" />,
    );
    expect(container.querySelector('circle')).toBeInTheDocument();
    expect(container.querySelector('rect[width="96"][height="22"]')).not.toBeInTheDocument();
  });

  it('renders a sidebar block for a sidebar layout', () => {
    const { container } = render(
      <TemplateSwatch layout="sidebar-left" primaryColor="#111827" secondaryColor="#374151" />,
    );
    // sidebar block is a translucent rect using primaryColor + alpha suffix '22'
    const sidebar = container.querySelector(`rect[fill="#11182722"]`);
    expect(sidebar).toBeInTheDocument();
  });

  it('renders no sidebar block for a single-column layout', () => {
    const { container } = render(
      <TemplateSwatch layout="single-column" primaryColor="#111827" secondaryColor="#374151" />,
    );
    expect(container.querySelector(`rect[fill="#11182722"]`)).not.toBeInTheDocument();
  });

  it('sets an accessible label derived from the layout key', () => {
    const { getByRole } = render(
      <TemplateSwatch layout="letter-classic" primaryColor="#111827" secondaryColor="#374151" />,
    );
    expect(getByRole('img', { name: /letter-classic/ })).toBeInTheDocument();
  });
});
