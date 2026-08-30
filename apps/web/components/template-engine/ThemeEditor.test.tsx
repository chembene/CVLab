import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeEditor } from './ThemeEditor';
import type { ThemeOverrides } from '@/lib/template-engine/theme';

describe('ThemeEditor', () => {
  it('calls onChange with a merged patch (not a replacement) when a color changes', () => {
    const onChange = jest.fn();
    const value: ThemeOverrides = { primaryColor: '#111111', fontFamily: 'Georgia' };
    render(<ThemeEditor value={value} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Cor primária'), { target: { value: '#ff0000' } });

    expect(onChange).toHaveBeenCalledWith({ primaryColor: '#ff0000', fontFamily: 'Georgia' });
  });

  it('parses the font size input as a number, not a string', () => {
    const onChange = jest.fn();
    render(<ThemeEditor value={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Tamanho da letra (px)'), { target: { value: '18' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 18 }));
  });

  it('toggles the icons checkbox to a boolean value', () => {
    const onChange = jest.fn();
    render(<ThemeEditor value={{ iconsEnabled: false }} onChange={onChange} />);

    fireEvent.click(screen.getByText('Mostrar ícones nas secções'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ iconsEnabled: true }));
  });

  it('renders the reset button only when onReset is provided, and invokes it on click', () => {
    const onReset = jest.fn();
    const { rerender } = render(<ThemeEditor value={{}} onChange={jest.fn()} />);
    expect(screen.queryByText('Repor predefinições do modelo')).not.toBeInTheDocument();

    rerender(<ThemeEditor value={{}} onChange={jest.fn()} onReset={onReset} />);
    fireEvent.click(screen.getByText('Repor predefinições do modelo'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
